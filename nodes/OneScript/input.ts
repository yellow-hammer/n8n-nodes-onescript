export const INPUT_VARIABLE = 'ВходящиеДанные';

export const INPUT_WRAPPER = [
	'// n8n-nodes-onescript: items прочитаны штатным ПрочитатьJSON.',
	'// ВходящиеДанные — Массив. Объекты JSON читаются в Соответствие (второй аргумент Истина).',
	'ЧтениеВходящихN8n = Новый ЧтениеJSON;',
	'ЧтениеВходящихN8n.ОткрытьФайл(АргументыКоманднойСтроки[0], "UTF-8");',
	'ВходящиеДанные = ПрочитатьJSON(ЧтениеВходящихN8n, Истина);',
	'ЧтениеВходящихN8n.Закрыть();',
	'',
].join('\n');

export const DEFAULT_CODE = [
	'// ВходящиеДанные уже заполнены обёрткой ноды.',
	'// У элемента ключ "json" — данные item n8n (Соответствие).',
	'',
	'Запись = Новый ЗаписьJSON;',
	'Запись.УстановитьСтроку();',
	'ЗаписатьJSON(Запись, ВходящиеДанные);',
	'Сообщить(Запись.Закрыть());',
	'',
].join('\n');

export function wrapInlineCode(code: string, passInput: boolean): string {
	if (!passInput) {
		return code;
	}
	return `${INPUT_WRAPPER}\n${code}`;
}
