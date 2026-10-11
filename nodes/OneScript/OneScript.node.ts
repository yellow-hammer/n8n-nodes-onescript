import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type {
	IExecuteFunctions,
	INode,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { isAutumnInline, writeAutumnInline } from './autumnInline';
import { callAutumn } from './autumnSession';
import { DEFAULT_CODE, wrapInlineCode } from './input';
import { stdoutToItems, textResultItem, valueToItems } from './output';
import {
	MAX_TIMEOUT_SECONDS,
	OscriptOutputLimitError,
	OscriptTimeoutError,
	runOscript,
	type OscriptRunResult,
} from './runOscript';

type SourceMode = 'code' | 'command' | 'file' | 'autumn';

const SOURCE_MODES = ['code', 'command', 'file', 'autumn'] as const satisfies readonly SourceMode[];
const MAX_COMMAND_LINE = 30000;

function isSourceMode(value: string): value is SourceMode {
	return (SOURCE_MODES as readonly string[]).includes(value);
}

function failureText(exitCode: number, stderr: string, stdout: string): string {
	const errorText = stderr.trim();
	if (errorText !== '') {
		return errorText;
	}
	const out = stdout.trim();
	if (out !== '') {
		return `oscript завершился с кодом ${exitCode}. stderr пуст.\n${out}`;
	}
	return `oscript завершился с кодом ${exitCode}. stderr пуст.`;
}

function readTimeout(node: INode, value: unknown): number {
	const timeout = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(timeout) || timeout < 1) {
		throw new NodeOperationError(node, 'Таймаут должен быть числом секунд не меньше 1.');
	}
	if (timeout > MAX_TIMEOUT_SECONDS) {
		throw new NodeOperationError(node, `Таймаут не может быть больше ${MAX_TIMEOUT_SECONDS} с.`);
	}
	return Math.floor(timeout);
}

function serializeItems(node: INode, items: INodeExecutionData[]): string {
	try {
		return JSON.stringify(items.map((item) => ({ json: item.json })));
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new NodeOperationError(node, `Не удалось сериализовать входящие items в JSON: ${reason}`);
	}
}

function attachPairedItem(
	produced: INodeExecutionData[],
	inputCount: number,
): INodeExecutionData[] {
	return produced.map((item, index) => ({
		...item,
		pairedItem: { item: inputCount > 0 ? Math.min(index, inputCount - 1) : 0 },
	}));
}

async function executeScript(
	scriptPath: string,
	cwd: string,
	passInput: boolean,
	inputPath: string | undefined,
	timeoutSeconds: number,
): Promise<OscriptRunResult> {
	const args = passInput && inputPath !== undefined ? [scriptPath, inputPath] : [scriptPath];
	return runOscript({ args, cwd, timeoutSeconds });
}

export class OneScript implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OneScript',
		name: 'oneScript',
		icon: { light: 'file:onescript.svg', dark: 'file:onescript.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle:
			'={{$parameter["mode"] === "autumn" ? "Осень" : $parameter["mode"] === "file" ? "Файл" : $parameter["mode"] === "command" ? "Текст" : "Код"}}',
		description: 'Выполняет код OneScript и желуди Осени',
		defaults: {
			name: 'OneScript',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Режим',
				name: 'mode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Код в ноде',
						value: 'code',
						description: 'Записать текст во временный файл и выполнить его',
					},
					{
						name: 'Текст в команде',
						value: 'command',
						description: 'Передать текст сценария в oscript ключом -c',
					},
					{
						name: 'Файл на диске',
						value: 'file',
						description: 'Выполнить существующий файл на машине n8n',
					},
					{
						name: 'Приложение Осени',
						value: 'autumn',
						description: 'Держать один процесс oscript и вызывать желудь',
					},
				],
				default: 'code',
				description: 'Откуда брать сценарий OneScript',
			},
			{
				displayName: 'Код',
				name: 'code',
				type: 'string',
				typeOptions: {
					editor: 'codeNodeEditor',
					// html не помечает идентификаторы BSL как неизвестные.
					editorLanguage: 'html',
					rows: 16,
				},
				default: DEFAULT_CODE,
				required: true,
				displayOptions: {
					show: {
						mode: ['code', 'command'],
					},
				},
				description:
					'Сценарий OneScript. При передаче items в режимах «Код в ноде» и «Текст в команде» данные уже в переменной ВходящиеДанные.',
			},
			{
				displayName: 'Путь к файлу',
				name: 'filePath',
				type: 'string',
				default: '',
				required: true,
				placeholder: '/data/scripts/onescript/echo-items.os',
				displayOptions: {
					show: {
						mode: ['file'],
					},
				},
				description:
					'Путь к .os-файлу на машине, где запущен n8n. Относительный путь считается от рабочего каталога процесса n8n.',
			},
			{
				displayName: 'Каталог приложения',
				name: 'appPath',
				type: 'string',
				default: '',
				required: true,
				placeholder: '/data/scripts/onescript-autumn',
				displayOptions: {
					show: {
						mode: ['autumn'],
					},
				},
				description:
					'Корень приложения Осени. Относительный путь считается от каталога процесса n8n. Классы: src/Классы, Классы, src/Classes, Classes или lib.config. Один процесс oscript на этот каталог.',
			},
			{
				displayName: 'Желудь',
				name: 'acorn',
				type: 'string',
				default: 'Эхо',
				required: true,
				placeholder: 'Эхо',
				displayOptions: {
					show: {
						mode: ['autumn'],
					},
				},
				description:
					'Имя желудя. Нода вызывает экспортную функцию Обработать и передаёт ей массив items.',
			},
			{
				displayName: 'Таймаут (сек.)',
				name: 'timeout',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: MAX_TIMEOUT_SECONDS,
					numberPrecision: 0,
				},
				default: 30,
				description:
					'Сколько секунд ждать завершения oscript. По истечении процесс останавливается. В режиме Осени останавливается общий процесс, следующий запуск поднимает его заново.',
			},
			{
				displayName: 'Передать входящие данные',
				name: 'passInput',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						mode: ['code', 'command', 'file'],
					},
				},
				description:
					'Записать items в JSON и передать путь в АргументыКоманднойСтроки[0]. В режимах кода и команды он читается в ВходящиеДанные.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		try {
			const items = await runOneScript(this);
			return [items];
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (this.continueOnFail()) {
				return [[{ json: { error: message }, pairedItem: { item: 0 } }]];
			}
			throw new NodeOperationError(this.getNode(), message);
		}
	}
}

async function runOneScript(context: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const modeValue = context.getNodeParameter('mode', 0) as string;
	if (!isSourceMode(modeValue)) {
		throw new NodeOperationError(context.getNode(), `Неизвестный режим: ${modeValue}`);
	}
	const mode: SourceMode = modeValue;

	const node = context.getNode();
	const timeoutSeconds = readTimeout(node, context.getNodeParameter('timeout', 0));
	const items = context.getInputData();
	if (mode === 'autumn') {
		try {
			return await runAutumn(context, items, timeoutSeconds);
		} catch (error) {
			rethrowRunError(context, error);
		}
	}

	const passInput = context.getNodeParameter('passInput', 0) as boolean;
	const directory = await mkdtemp(join(tmpdir(), 'n8n-onescript-'));
	try {
		let inputPath: string | undefined;
		if (passInput) {
			inputPath = join(directory, 'input.json');
			await writeFile(inputPath, serializeItems(node, items), 'utf8');
		}

		const result = await runByMode(context, mode, {
			directory,
			passInput,
			inputPath,
			timeoutSeconds,
		});

		if (result.exitCode !== 0) {
			throw new NodeOperationError(
				context.getNode(),
				failureText(result.exitCode, result.stderr, result.stdout),
			);
		}

		const parsed = stdoutToItems(result.stdout);
		const produced =
			parsed.kind === 'items'
				? parsed.items
				: [textResultItem(result.stdout, result.stderr, result.exitCode)];
		return attachPairedItem(produced, items.length);
	} catch (error) {
		rethrowRunError(context, error);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

type RunContext = {
	directory: string;
	passInput: boolean;
	inputPath: string | undefined;
	timeoutSeconds: number;
};

async function runByMode(
	context: IExecuteFunctions,
	mode: 'code' | 'command' | 'file',
	run: RunContext,
): Promise<OscriptRunResult> {
	switch (mode) {
		case 'code':
			return runInline(context, run);
		case 'command':
			return runCommand(context, run);
		case 'file':
			return runFile(context, run);
		default: {
			const unexpected: never = mode;
			throw new NodeOperationError(context.getNode(), `Неизвестный режим: ${String(unexpected)}`);
		}
	}
}

async function runInline(context: IExecuteFunctions, run: RunContext): Promise<OscriptRunResult> {
	const code = context.getNodeParameter('code', 0) as string;
	if (code.trim() === '') {
		throw new NodeOperationError(context.getNode(), 'Код OneScript пуст.');
	}

	if (isAutumnInline(code)) {
		const scriptPath = await writeAutumnInline(run.directory, code);
		return executeScript(scriptPath, run.directory, run.passInput, run.inputPath, run.timeoutSeconds);
	}

	const scriptPath = join(run.directory, 'script.os');
	await writeFile(scriptPath, wrapInlineCode(code, run.passInput), 'utf8');
	return executeScript(scriptPath, run.directory, run.passInput, run.inputPath, run.timeoutSeconds);
}

async function runCommand(context: IExecuteFunctions, run: RunContext): Promise<OscriptRunResult> {
	const code = context.getNodeParameter('code', 0) as string;
	if (code.trim() === '') {
		throw new NodeOperationError(context.getNode(), 'Код OneScript пуст.');
	}

	const source = wrapInlineCode(code, run.passInput);
	const args =
		run.passInput && run.inputPath !== undefined ? ['-c', source, run.inputPath] : ['-c', source];
	const commandLength = args.reduce((sum, arg) => sum + arg.length + 1, 'oscript'.length);
	if (commandLength > MAX_COMMAND_LINE) {
		throw new NodeOperationError(
			context.getNode(),
			'Текст сценария длиннее, чем принимает команда oscript -c. Для длинного сценария используйте режим «Код в ноде».',
		);
	}

	return runOscript({ args, cwd: run.directory, timeoutSeconds: run.timeoutSeconds });
}

async function runAutumn(
	context: IExecuteFunctions,
	items: INodeExecutionData[],
	timeoutSeconds: number,
): Promise<INodeExecutionData[]> {
	const appPath = (context.getNodeParameter('appPath', 0) as string).trim();
	const acorn = (context.getNodeParameter('acorn', 0) as string).trim();
	if (appPath === '') {
		throw new NodeOperationError(context.getNode(), 'Путь к приложению Осени пуст.');
	}
	if (acorn === '') {
		throw new NodeOperationError(context.getNode(), 'Имя желудя пусто.');
	}

	const absolutePath = isAbsolute(appPath) ? appPath : resolve(process.cwd(), appPath);
	const body = await callAutumn({
		appPath: absolutePath,
		acorn,
		items: items.map((item) => ({ json: item.json })),
		timeoutSeconds,
	});
	return attachPairedItem(valueToItems(body).items, items.length);
}

function rethrowRunError(context: IExecuteFunctions, error: unknown): never {
	const message = error instanceof Error ? error.message : String(error);
	const stderr =
		error instanceof OscriptTimeoutError || error instanceof OscriptOutputLimitError
			? error.stderr.trim()
			: '';
	const text = stderr === '' ? message : `${message}\n${stderr}`;
	throw new NodeOperationError(context.getNode(), text);
}

async function runFile(context: IExecuteFunctions, run: RunContext): Promise<OscriptRunResult> {
	const filePath = (context.getNodeParameter('filePath', 0) as string).trim();
	if (filePath === '') {
		throw new NodeOperationError(context.getNode(), 'Путь к .os-файлу пуст.');
	}

	const scriptPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
	return executeScript(
		scriptPath,
		dirname(scriptPath),
		run.passInput,
		run.inputPath,
		run.timeoutSeconds,
	);
}
