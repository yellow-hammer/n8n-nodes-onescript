import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { runOscript } = require('../dist/nodes/OneScript/runOscript.js');

const directory = await mkdtemp(join(tmpdir(), 'n8n-onescript-command-'));
try {
	const plain = await runOscript({
		args: ['-c', 'Сообщить("Привет, -c");'],
		cwd: directory,
		timeoutSeconds: 30,
	});
	assert.equal(plain.exitCode, 0);
	assert.match(plain.stdout, /Привет, -c/);

	const inputPath = join(directory, 'input.json');
	await writeFile(inputPath, '[{"json":{"name":"Стул"}}]', 'utf8');
	const wrapped = [
		'Чтение = Новый ЧтениеJSON;',
		'Чтение.ОткрытьФайл(АргументыКоманднойСтроки[0], "UTF-8");',
		'Данные = ПрочитатьJSON(Чтение, Истина);',
		'Чтение.Закрыть();',
		'Сообщить(Данные[0]["json"]["name"]);',
	].join('\n');
	const withArg = await runOscript({
		args: ['-c', wrapped, inputPath],
		cwd: directory,
		timeoutSeconds: 30,
	});
	assert.equal(withArg.exitCode, 0, withArg.stderr);
	assert.match(withArg.stdout, /Стул/);

	console.log('check-command: ok');
} finally {
	await rm(directory, { recursive: true, force: true });
}
