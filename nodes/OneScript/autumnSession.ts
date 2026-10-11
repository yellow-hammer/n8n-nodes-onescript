import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeCall, parseFrame, type HostFrame } from './autumnProtocol';
import {
	killChild,
	MAX_OUTPUT_BYTES,
	OscriptNotFoundError,
	OscriptOutputLimitError,
	OscriptTimeoutError,
} from './runOscript';

const CLASS_DIRECTORIES = ['src/Классы', 'src/Classes', 'Классы', 'Classes'] as const;
const PLACEHOLDER = '@@APP_PATH@@';

function encodeCallResult(acorn: string, items: unknown[]): { payload: string } | { reason: string } {
	try {
		return { payload: encodeCall(acorn, items) };
	} catch (error) {
		return { reason: error instanceof Error ? error.message : String(error) };
	}
}

class AutumnHostError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AutumnHostError';
	}
}

type AutumnCall = {
	appPath: string;
	acorn: string;
	items: unknown[];
	timeoutSeconds: number;
};

type Expectation = 'ready' | 'result';

type Pending = {
	expect: Expectation;
	timer: NodeJS.Timeout;
	settled: boolean;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

let hostTemplate: string | undefined;

function readHostTemplate(): string {
	if (hostTemplate === undefined) {
		hostTemplate = readFileSync(join(__dirname, 'autumn-host.os'), 'utf8');
		if (!hostTemplate.includes(PLACEHOLDER)) {
			throw new AutumnHostError('В autumn-host.os нет пути приложения.');
		}
	}
	return hostTemplate;
}

function existingDirectory(appPath: string): string | undefined {
	try {
		return realpathSync(appPath);
	} catch {
		return undefined;
	}
}

function resolveAutumnApp(appPath: string): string {
	if (appPath.includes('"') || appPath.includes('\n') || appPath.includes('\r') || appPath.includes('\0')) {
		throw new AutumnHostError('Путь к приложению Осени содержит недопустимые символы.');
	}

	const canonical = existingDirectory(appPath);
	if (canonical === undefined) {
		throw new AutumnHostError(`Каталог приложения Осени не найден: ${appPath}`);
	}

	if (!statSync(canonical).isDirectory()) {
		throw new AutumnHostError(`Путь приложения Осени не является каталогом: ${canonical}`);
	}

	const hasClasses = CLASS_DIRECTORIES.some((directory) => existsSync(join(canonical, directory)));
	const hasManifest = existsSync(join(canonical, 'lib.config'));
	if (!hasClasses && !hasManifest) {
		throw new AutumnHostError(
			`В ${canonical} нет классов Осени. Нужен каталог src/Классы, Классы, src/Classes, Classes или файл lib.config.`,
		);
	}

	return canonical;
}

function launcherPath(appPath: string): string {
	const directory = join(tmpdir(), 'n8n-onescript-autumn');
	mkdirSync(directory, { recursive: true });
	const name = createHash('sha256').update(appPath).digest('hex').slice(0, 16);
	const filePath = join(directory, `${name}.os`);
	const source = readHostTemplate().split(PLACEHOLDER).join(appPath);
	writeFileSync(filePath, source, 'utf8');
	return filePath;
}

class AutumnSession {
	private child: ChildProcess | undefined;
	private generation = 0;
	private ready = false;
	private closed = false;
	private stdoutBuffer = '';
	private stderr = '';
	private sideLog = '';
	private pending: Pending | undefined;
	private tail: Promise<void> = Promise.resolve();

	constructor(private readonly appPath: string) {}

	call(acorn: string, items: unknown[], timeoutSeconds: number): Promise<unknown> {
		const run = () => this.dispatch(acorn, items, timeoutSeconds);
		const queued = this.tail.then(run);
		this.tail = queued.then(
			() => undefined,
			() => undefined,
		);
		return queued;
	}

	stop(): void {
		this.closed = true;
		this.drop(new AutumnHostError('Процесс Осени остановлен.'));
	}

	private async dispatch(acorn: string, items: unknown[], timeoutSeconds: number): Promise<unknown> {
		if (this.closed) {
			throw new AutumnHostError('Процесс Осени остановлен.');
		}

		const deadline = Date.now() + timeoutSeconds * 1000;
		await this.ensureReady(deadline, timeoutSeconds);
		return this.exchange(acorn, items, deadline, timeoutSeconds);
	}

	private async ensureReady(deadline: number, timeoutSeconds: number): Promise<void> {
		if (this.ready && this.isAlive()) {
			return;
		}
		const generation = this.openChild();
		await this.arm('ready', deadline, timeoutSeconds, generation);
	}

	private async exchange(
		acorn: string,
		items: unknown[],
		deadline: number,
		timeoutSeconds: number,
	): Promise<unknown> {
		const generation = this.generation;
		this.stderr = '';
		this.sideLog = '';
		const encoded = encodeCallResult(acorn, items);
		if ('reason' in encoded) {
			throw new AutumnHostError(`Не удалось сериализовать запрос к Осени: ${encoded.reason}`);
		}
		const payload = encoded.payload;

		if (Buffer.byteLength(payload, 'utf8') + 1 > MAX_OUTPUT_BYTES) {
			throw new AutumnHostError('Запрос к Осени превышает лимит 16 МиБ.');
		}

		const result = this.arm('result', deadline, timeoutSeconds, generation);
		this.write(`${payload}\n`, generation);
		return result;
	}

	private isAlive(): boolean {
		return this.child !== undefined && this.child.exitCode === null && !this.child.killed;
	}

	private openChild(): number {
		this.generation += 1;
		const generation = this.generation;
		this.ready = false;
		this.stdoutBuffer = '';
		this.stderr = '';
		this.sideLog = '';

		const previous = this.child;
		this.child = undefined;
		if (previous) {
			killChild(previous);
		}

		const child = spawn('oscript', [launcherPath(this.appPath)], {
			cwd: this.appPath,
			detached: process.platform !== 'win32',
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		if (!child.stdin || !child.stdout || !child.stderr) {
			child.kill();
			throw new AutumnHostError('Не удалось открыть потоки процесса oscript.');
		}
		this.child = child;
		this.attach(child, generation);
		return generation;
	}

	private attach(child: ChildProcess, generation: number): void {
		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		const onPipeError = (error: Error): void => {
			if (generation !== this.generation) {
				return;
			}
			this.drop(error);
		};
		child.stdin?.on('error', onPipeError);
		child.stdout?.on('error', onPipeError);
		child.stderr?.on('error', onPipeError);
		child.stdout?.on('data', (chunk: string) => {
			if (generation !== this.generation) {
				return;
			}
			this.stdoutBuffer += chunk;
			this.noteSize(generation);
			this.drain(generation);
		});
		child.stderr?.on('data', (chunk: string) => {
			if (generation !== this.generation) {
				return;
			}
			this.stderr += chunk;
			this.noteSize(generation);
		});
		child.on('error', (error: NodeJS.ErrnoException) => {
			if (generation !== this.generation) {
				return;
			}
			this.child = undefined;
			this.ready = false;
			const wrapped = error.code === 'ENOENT' ? new OscriptNotFoundError() : error;
			this.finish((pending) => pending.reject(wrapped));
		});
		child.on('close', (code) => {
			if (generation !== this.generation) {
				return;
			}
			this.child = undefined;
			this.ready = false;
			this.finish((pending) => pending.reject(new AutumnHostError(this.exitText(code))));
		});
	}

	private arm(
		expect: Expectation,
		deadline: number,
		timeoutSeconds: number,
		generation: number,
	): Promise<unknown> {
		if (this.pending && !this.pending.settled) {
			return Promise.reject(new AutumnHostError('Внутренняя очередь Осени уже ждёт ответ.'));
		}

		return new Promise((resolve, reject) => {
			this.pending = {
				expect,
				settled: false,
				resolve,
				reject,
				timer: setTimeout(() => {
					if (generation !== this.generation) {
						return;
					}
					const error =
						expect === 'ready'
							? new AutumnHostError(this.notReadyText(timeoutSeconds))
							: new OscriptTimeoutError(timeoutSeconds, this.details());
					this.drop(error);
				}, Math.max(1, deadline - Date.now())),
			};
		});
	}

	private write(line: string, generation: number): void {
		const stdin = this.child?.stdin;
		if (!stdin || generation !== this.generation) {
			this.drop(new AutumnHostError('Процесс Осени уже остановлен.'));
			return;
		}
		stdin.write(line, 'utf8', (error) => {
			if (!error || generation !== this.generation) {
				return;
			}
			this.drop(error);
		});
	}

	private drain(generation: number): void {
		let newline = this.stdoutBuffer.indexOf('\n');
		while (newline !== -1 && generation === this.generation) {
			const line = this.stdoutBuffer
				.slice(0, newline)
				.replace(/\r$/, '')
				.replace(/^\uFEFF+/, '');
			this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
			this.onLine(generation, line);
			newline = this.stdoutBuffer.indexOf('\n');
		}
	}

	private onLine(generation: number, line: string): void {
		if (generation !== this.generation || line === '') {
			return;
		}

		try {
			const frame = parseFrame(line);
			if (frame === undefined) {
				this.sideLog = this.sideLog === '' ? line : `${this.sideLog}\n${line}`;
				this.noteSize(generation);
				return;
			}
			this.onFrame(generation, frame);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.drop(new AutumnHostError(message));
		}
	}

	private onFrame(generation: number, frame: HostFrame): void {
		if (generation !== this.generation) {
			return;
		}

		const pending = this.pending;
		if (!pending || pending.settled) {
			this.drop(new AutumnHostError('Хост Осени прислал кадр без запроса.'));
			return;
		}

		if (pending.expect === 'ready') {
			if (frame.kind !== 'ready') {
				this.drop(new AutumnHostError('Хост Осени прислал ответ до сигнала готовности.'));
				return;
			}
			this.ready = true;
			this.finish((waiter) => waiter.resolve(undefined));
			return;
		}

		switch (frame.kind) {
			case 'ready':
				this.drop(new AutumnHostError('Хост Осени повторно прислал готовность.'));
				return;
			case 'error':
				this.finish((waiter) => waiter.reject(new AutumnHostError(frame.error)));
				return;
			case 'result':
				this.finish((waiter) => waiter.resolve(frame.body));
				return;
			default: {
				const unexpected: never = frame;
				this.drop(new AutumnHostError(`Неизвестный кадр хоста Осени: ${String(unexpected)}`));
			}
		}
	}

	private noteSize(generation: number): void {
		if (generation !== this.generation) {
			return;
		}
		const size =
			Buffer.byteLength(this.stdoutBuffer, 'utf8') +
			Buffer.byteLength(this.stderr, 'utf8') +
			Buffer.byteLength(this.sideLog, 'utf8');
		if (size > MAX_OUTPUT_BYTES) {
			this.drop(new OscriptOutputLimitError(this.stderr));
		}
	}

	private finish(action: (pending: Pending) => void): void {
		const pending = this.pending;
		if (!pending || pending.settled) {
			return;
		}
		pending.settled = true;
		clearTimeout(pending.timer);
		this.pending = undefined;
		action(pending);
	}

	private drop(error: Error): void {
		this.generation += 1;
		this.ready = false;
		this.finish((pending) => pending.reject(error));
		const child = this.child;
		this.child = undefined;
		if (child) {
			killChild(child);
		}
	}

	private details(): string {
		return [this.stderr.trim(), this.sideLog.trim()].filter((part) => part !== '').join('\n');
	}

	private exitText(code: number | null): string {
		const details = this.details();
		if (details !== '') {
			return details;
		}
		return `Процесс oscript завершился с кодом ${code ?? 1}.`;
	}

	private notReadyText(timeoutSeconds: number): string {
		const details = this.details();
		const text = `Процесс Осени не подтвердил готовность за ${timeoutSeconds} с. Если ЗапуститьПриложение ждёт рогатку, хост не переходит к приёму вызовов.`;
		return details === '' ? text : `${text}\n${details}`;
	}
}

const sessions = new Map<string, AutumnSession>();

export function callAutumn(options: AutumnCall): Promise<unknown> {
	const acorn = options.acorn.trim();
	if (acorn === '') {
		throw new AutumnHostError('Имя желудя пусто.');
	}

	const appPath = resolveAutumnApp(options.appPath);
	let session = sessions.get(appPath);
	if (!session) {
		session = new AutumnSession(appPath);
		sessions.set(appPath, session);
	}
	return session.call(acorn, options.items, options.timeoutSeconds);
}

export function closeAutumnSessions(): void {
	const running = [...sessions.values()];
	sessions.clear();
	for (const session of running) {
		session.stop();
	}
}

function shutdownAutumn(): void {
	closeAutumnSessions();
}

process.once('SIGINT', shutdownAutumn);
process.once('SIGTERM', shutdownAutumn);
process.once('exit', shutdownAutumn);
