import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { writeAutumnInline } = require('../dist/nodes/OneScript/autumnInline.js');
const { runOscript } = require('../dist/nodes/OneScript/runOscript.js');
const { stdoutToItems } = require('../dist/nodes/OneScript/output.js');

const code = [
	'#native',
	'',
	'&Желудь',
	'Процедура ПриСозданииОбъекта()',
	'КонецПроцедуры',
	'',
	'Функция Обработать(ВходящиеДанные) Экспорт',
	'\tСообщить("шум");',
	'\tДля Каждого Элемент Из ВходящиеДанные Цикл',
	'\t\tДанные = Элемент["json"];',
	'\t\tДанные.Вставить("via", "autumn");',
	'\tКонецЦикла;',
	'\tВозврат ВходящиеДанные;',
	'КонецФункции',
	'',
].join('\n');

const directory = await mkdtemp(join(tmpdir(), 'n8n-autumn-inline-'));
try {
	const inputPath = join(directory, 'input.json');
	await writeFile(inputPath, '[{"json":{"name":"Стул"}}]', 'utf8');
	const scriptPath = await writeAutumnInline(directory, code);
	const result = await runOscript({
		args: [scriptPath, inputPath],
		cwd: directory,
		timeoutSeconds: 30,
	});
	assert.equal(result.exitCode, 0, result.stderr);
	const parsed = stdoutToItems(result.stdout);
	assert.equal(parsed.kind, 'items');
	assert.deepEqual(parsed.items, [{ json: { name: 'Стул', via: 'autumn' } }]);
	console.log('check-autumn-inline: ok');
} finally {
	await rm(directory, { recursive: true, force: true });
}
