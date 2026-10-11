import type { IDataObject, INodeExecutionData } from 'n8n-workflow';

type StdoutParse = { kind: 'items'; items: INodeExecutionData[] } | { kind: 'text' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toItem(value: unknown): INodeExecutionData {
	if (isPlainObject(value) && isPlainObject(value.json)) {
		return { json: value.json as IDataObject };
	}
	if (isPlainObject(value)) {
		return { json: value as IDataObject };
	}
	return { json: { value } as IDataObject };
}

export function valueToItems(value: unknown): { kind: 'items'; items: INodeExecutionData[] } {
	if (Array.isArray(value)) {
		return { kind: 'items', items: value.map((entry) => toItem(entry)) };
	}
	return { kind: 'items', items: [toItem(value)] };
}

export function stdoutToItems(stdout: string): StdoutParse {
	const trimmed = stdout.replace(/^\uFEFF/, '').trim();
	if (trimmed === '') {
		return { kind: 'text' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as unknown;
	} catch {
		return { kind: 'text' };
	}

	return valueToItems(parsed);
}

export function textResultItem(
	stdout: string,
	stderr: string,
	exitCode: number,
): INodeExecutionData {
	return {
		json: {
			stdout,
			stderr,
			exitCode,
		},
	};
}
