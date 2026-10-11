export const FRAME_PREFIX = '@@N8N ';

export type HostFrame =
	| { kind: 'ready' }
	| { kind: 'result'; body: unknown }
	| { kind: 'error'; error: string };

export class AutumnProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AutumnProtocolError';
	}
}

export function encodeCall(acorn: string, items: unknown[]): string {
	return FRAME_PREFIX + JSON.stringify({ acorn, items });
}

const INVALID_JSON = Symbol('invalid-json');

function readJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return INVALID_JSON;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFrame(line: string): HostFrame | undefined {
	const trimmed = line.replace(/^\uFEFF+/, '').trim();
	if (trimmed === '' || !trimmed.startsWith(FRAME_PREFIX)) {
		return undefined;
	}

	const payload = readJson(trimmed.slice(FRAME_PREFIX.length));
	if (payload === INVALID_JSON) {
		throw new AutumnProtocolError('Хост Осени прислал кадр @@N8N, который не является JSON.');
	}

	if (!isRecord(payload)) {
		throw new AutumnProtocolError('Хост Осени прислал кадр @@N8N не объектом.');
	}
	if (payload.ready === true) {
		return { kind: 'ready' };
	}
	if (payload.ok === true && 'body' in payload) {
		return { kind: 'result', body: payload.body };
	}
	if (payload.ok === false && typeof payload.error === 'string') {
		return { kind: 'error', error: payload.error };
	}
	throw new AutumnProtocolError('Хост Осени прислал непонятный кадр @@N8N.');
}
