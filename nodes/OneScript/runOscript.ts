import { spawn, type ChildProcess } from 'node:child_process';

export const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
export const MAX_TIMEOUT_SECONDS = 24 * 60 * 60;

export type OscriptRunResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

export class OscriptNotFoundError extends Error {
	readonly stderr = '';

	constructor() {
		super('oscript не найден в PATH процесса n8n');
		this.name = 'OscriptNotFoundError';
	}
}

export class OscriptTimeoutError extends Error {
	readonly stderr: string;

	constructor(seconds: number, stderr: string) {
		super(`Превышен таймаут ${seconds} с. Процесс oscript остановлен.`);
		this.name = 'OscriptTimeoutError';
		this.stderr = stderr;
	}
}

export class OscriptOutputLimitError extends Error {
	readonly stderr: string;

	constructor(stderr: string) {
		super('Вывод oscript превысил лимит 16 МиБ.');
		this.name = 'OscriptOutputLimitError';
		this.stderr = stderr;
	}
}

export type RunOscriptOptions = {
	args: string[];
	cwd: string;
	timeoutSeconds: number;
};

function killChild(child: ChildProcess): void {
	if (child.pid === undefined) {
		return;
	}

	if (process.platform !== 'win32') {
		try {
			process.kill(-child.pid, 'SIGKILL');
			return;
		} catch {
			// Процесс уже завершился или не стал лидером группы.
		}
	}

	child.kill('SIGKILL');
}

export function runOscript(options: RunOscriptOptions): Promise<OscriptRunResult> {
	const { args, cwd, timeoutSeconds } = options;

	return new Promise((resolve, reject) => {
		const child = spawn('oscript', args, {
			cwd,
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		});

		let stdout = '';
		let stderr = '';
		let settled = false;
		let timedOut = false;
		let outputTooLarge = false;

		const finish = (handler: () => void): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			handler();
		};

		const timer = setTimeout(() => {
			timedOut = true;
			killChild(child);
		}, timeoutSeconds * 1000);

		const takeChunk = (stream: 'stdout' | 'stderr') => (chunk: string) => {
			if (stream === 'stdout') {
				stdout += chunk;
			} else {
				stderr += chunk;
			}

			const size = Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8');
			if (size > MAX_OUTPUT_BYTES) {
				outputTooLarge = true;
				killChild(child);
			}
		};

		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		child.stdout?.on('data', takeChunk('stdout'));
		child.stderr?.on('data', takeChunk('stderr'));

		child.on('error', (error: NodeJS.ErrnoException) => {
			finish(() => {
				if (error.code === 'ENOENT') {
					reject(new OscriptNotFoundError());
					return;
				}
				reject(error);
			});
		});

		child.on('close', (code) => {
			finish(() => {
				if (timedOut) {
					reject(new OscriptTimeoutError(timeoutSeconds, stderr));
					return;
				}
				if (outputTooLarge) {
					reject(new OscriptOutputLimitError(stderr));
					return;
				}
				resolve({
					stdout,
					stderr,
					exitCode: code ?? 1,
				});
			});
		});
	});
}
