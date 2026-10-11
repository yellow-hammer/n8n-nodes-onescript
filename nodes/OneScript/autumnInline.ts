import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const AUTUMN_INLINE_ACORN = 'Обработчик';

export function isAutumnInline(code: string): boolean {
	return code.split(/\r?\n/).some((line) => {
		const trimmed = line.trim();
		return trimmed === '&Желудь' || trimmed.startsWith('&Желудь(');
	});
}

function autumnInlineLauncher(appPath: string): string {
	return [
		'#Использовать autumn',
		`#Использовать "${appPath}"`,
		'',
		'Если АргументыКоманднойСтроки.Количество() = 0 Тогда',
		'\tДанные = Новый Массив;',
		'Иначе',
		'\tЧтение = Новый ЧтениеJSON;',
		'\tЧтение.ОткрытьФайл(АргументыКоманднойСтроки[0], "UTF-8");',
		'\tДанные = ПрочитатьJSON(Чтение, Истина);',
		'\tЧтение.Закрыть();',
		'КонецЕсли;',
		'',
		'Поделка = Новый Поделка;',
		'Поделка.ЗапуститьПриложение();',
		`Желудь = Поделка.НайтиЖелудь("${AUTUMN_INLINE_ACORN}");`,
		'ПотокВывода = Консоль.ОткрытьСтандартныйПотокВывода();',
		'ПотокСообщений = Новый ПотокВПамяти;',
		'Консоль.УстановитьПотокВывода(ПотокСообщений);',
		'Попытка',
		'\tРезультат = Желудь.Обработать(Данные);',
		'\tКонсоль.УстановитьПотокВывода(ПотокВывода);',
		'Исключение',
		'\tКонсоль.УстановитьПотокВывода(ПотокВывода);',
		'\tВызватьИсключение;',
		'КонецПопытки;',
		'',
		'Запись = Новый ЗаписьJSON;',
		'Запись.УстановитьСтроку();',
		'ЗаписатьJSON(Запись, Результат);',
		'Сообщить(Запись.Закрыть());',
		'',
	].join('\n');
}

export async function writeAutumnInline(directory: string, code: string): Promise<string> {
	const classes = join(directory, 'src', 'Классы');
	await mkdir(classes, { recursive: true });
	await writeFile(join(classes, `${AUTUMN_INLINE_ACORN}.os`), code, 'utf8');
	const scriptPath = join(directory, 'launch.os');
	await writeFile(scriptPath, autumnInlineLauncher(directory), 'utf8');
	return scriptPath;
}
