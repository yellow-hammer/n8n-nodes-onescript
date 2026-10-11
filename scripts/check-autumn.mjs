import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { callAutumn, closeAutumnSessions } = require('../dist/nodes/OneScript/autumnSession.js');

process.on('SIGINT', () => {
	closeAutumnSessions();
	process.exit(130);
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = join(root, 'examples', 'onescript-autumn-order');
const tempDirs = [];

function kopeks(value) {
	return Math.round(Number(value) * 100);
}

function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.floor(sorted.length / 2)];
}

function call(items, timeoutSeconds = 30, acorn = 'РасчетЗаказа', path = appPath) {
	return callAutumn({ appPath: path, acorn, items, timeoutSeconds });
}

async function writeApp(className, body) {
	const directory = await mkdtemp(join(tmpdir(), 'n8n-autumn-app-'));
	tempDirs.push(directory);
	const classes = join(directory, 'src', 'Классы');
	await mkdir(classes, { recursive: true });
	const source = [
		'&Желудь',
		'Процедура ПриСозданииОбъекта()',
		'КонецПроцедуры',
		'',
		'Функция Обработать(ВходящиеДанные) Экспорт',
		body,
		'КонецФункции',
		'',
	].join('\n');
	await writeFile(join(classes, `${className}.os`), source, 'utf8');
	return directory;
}

const shopOrder = {
	orderId: 'A-1042',
	customer: 'Мария Соколова',
	phone: '+7 900 000-00-00',
	lines: [
		{ sku: 'CHAIR-OSK', name: 'Стул «Осака»', qty: 2, price: 4590, discountPercent: 10 },
		{ sku: 'DELIVERY', name: 'Доставка по городу', qty: 1, price: 350 },
	],
};

try {
	const body = await call([{ json: shopOrder }]);
	const order = body[0].json;
	assert.equal(order.orderId, 'A-1042');
	assert.equal(order.customer, 'Мария Соколова');
	assert.equal(order.phone, '+7 900 000-00-00');
	assert.equal(order.lines[0].grossKopeks, undefined);
	assert.equal(kopeks(order.lines[0].gross), 826200);
	assert.equal(kopeks(order.lines[0].vat), 148987);
	assert.equal(kopeks(order.lines[0].net), 677213);
	assert.equal(kopeks(order.lines[1].gross), 35000);
	assert.equal(kopeks(order.lines[1].vat), 6311);
	assert.equal(kopeks(order.lines[1].net), 28689);
	assert.equal(kopeks(order.totalGross), 861200);
	assert.equal(kopeks(order.totalVat), 155298);
	assert.equal(kopeks(order.totalNet), 705902);

	const edge = await call([
		{
			json: {
				orderId: 'B-1',
				lines: [
					{ sku: 'KG', name: 'Кофе', qty: 1.5, price: 100, discountPercent: 0 },
					{ sku: 'HALF', name: 'Хлеб', qty: 1, price: 10.01, discountPercent: 50 },
				],
			},
		},
	]);
	assert.equal(kopeks(edge[0].json.lines[0].gross), 15000);
	assert.equal(kopeks(edge[0].json.lines[0].vat), 2705);
	assert.equal(kopeks(edge[0].json.lines[0].net), 12295);
	assert.equal(kopeks(edge[0].json.lines[1].gross), 500);
	assert.equal(kopeks(edge[0].json.lines[1].vat), 90);
	assert.equal(kopeks(edge[0].json.lines[1].net), 410);

	const empty = await call([{ json: { orderId: 'E', lines: [] } }]);
	assert.equal(kopeks(empty[0].json.totalGross), 0);

	await assert.rejects(
		async () => call([{ json: { orderId: 'X', lines: [{ price: 10 }] } }]),
		/price и qty/,
	);
	const afterError = await call([{ json: shopOrder }]);
	assert.equal(afterError[0].json.orderId, 'A-1042');

	await assert.rejects(async () => call([], 30, 'НетТакого'), /Желуд/);
	await assert.rejects(
		async () => call([{ json: { orderId: 'Z', lines: [{ qty: 0, price: 1 }] } }]),
		/больше нуля/,
	);
	await assert.rejects(
		async () => call([{ json: { orderId: 'Z', lines: [{ qty: 1, price: 1, discountPercent: 101 }] } }]),
		/от 0 до 100/,
	);

	const [left, right] = await Promise.all([
		call([{ json: { ...shopOrder, orderId: 'L' } }]),
		call([
			{
				json: {
					orderId: 'R',
					lines: [{ sku: 'DELIVERY', name: 'Доставка', qty: 1, price: 350 }],
				},
			},
		]),
	]);
	assert.equal(left[0].json.orderId, 'L');
	assert.equal(kopeks(left[0].json.totalGross), 861200);
	assert.equal(right[0].json.orderId, 'R');
	assert.equal(kopeks(right[0].json.totalGross), 35000);

	await assert.rejects(
		async () =>
			callAutumn({ appPath: join(root, 'no-such-app'), acorn: 'РасчетЗаказа', items: [], timeoutSeconds: 5 }),
		/не найден/,
	);
	const emptyDir = await mkdtemp(join(tmpdir(), 'n8n-autumn-empty-'));
	tempDirs.push(emptyDir);
	await assert.rejects(
		async () => callAutumn({ appPath: emptyDir, acorn: 'РасчетЗаказа', items: [], timeoutSeconds: 5 }),
		/нет классов/,
	);

	const cold = [];
	for (let index = 0; index < 3; index += 1) {
		closeAutumnSessions();
		const started = performance.now();
		await call([{ json: shopOrder }]);
		cold.push(performance.now() - started);
	}
	const warm = [];
	for (let index = 0; index < 5; index += 1) {
		const started = performance.now();
		await call([{ json: shopOrder }]);
		warm.push(performance.now() - started);
	}
	const coldMedian = median(cold);
	const warmMedian = median(warm);
	await assert.rejects(async () =>
		call([{ json: { pad: 'x'.repeat(8 * 1024 * 1024) } }], 0),
	);
	const afterBrokenWrite = await call([{ json: shopOrder }]);
	assert.equal(afterBrokenWrite[0].json.orderId, 'A-1042');
	assert.ok(warmMedian < coldMedian / 3);

	const shoutDir = await writeApp('Крикун', 'Сообщить("шум из желудя");\n\tВозврат ВходящиеДанные;');
	const shouted = await call([{ json: { a: 1 } }], 30, 'Крикун', shoutDir);
	assert.deepEqual(shouted, [{ json: { a: 1 } }]);

	const sleepDir = await writeApp('Сон', 'Приостановить(20000);\n\tВозврат ВходящиеДанные;');
	const timeoutStarted = performance.now();
	await assert.rejects(async () => call([{ json: {} }], 3, 'Сон', sleepDir), /таймаут/);
	await assert.rejects(async () => call([{ json: {} }], 3, 'Сон', sleepDir), /таймаут/);
	assert.ok(performance.now() - timeoutStarted < 15000);

	const recovered = await call([{ json: shopOrder }]);
	assert.equal(recovered[0].json.orderId, 'A-1042');

	const cartPath = join(root, 'examples', 'onescript-autumn-cart');
	const cart = await call(
		[
			{
				json: {
					orderId: 'B-77',
					lines: [
						{ type: 'goods', sku: 'CHAIR-OSK', name: 'Стул', qty: 2, price: 4590, discountPercent: 10 },
						{ type: 'service', sku: 'ASSEMBLY', name: 'Сборка', qty: 1, price: 1000 },
						{ type: 'delivery', sku: 'DELIVERY', name: 'Доставка', qty: 1, price: 350 },
					],
				},
			},
		],
		30,
		'РасчетКорзины',
		cartPath,
	);
	assert.equal(cart[0].json.lines[0].branch, 'goods');
	assert.equal(cart[0].json.lines[1].branch, 'service');
	assert.equal(cart[0].json.lines[2].branch, 'delivery-free');
	assert.equal(kopeks(cart[0].json.totalGross), 948200);
	assert.equal(kopeks(cart[0].json.totalVat), 170987);
	const paid = await call(
		[
			{
				json: {
					orderId: 'B-1',
					lines: [
						{ type: 'goods', sku: 'MUG', name: 'Кружка', qty: 1, price: 1000 },
						{ type: 'delivery', sku: 'DELIVERY', name: 'Доставка', qty: 1, price: 350 },
					],
				},
			},
		],
		30,
		'РасчетКорзины',
		cartPath,
	);
	assert.equal(paid[0].json.lines[1].branch, 'delivery');
	assert.equal(kopeks(paid[0].json.lines[1].gross), 35000);

	const branchesPath = join(root, 'examples', 'onescript-autumn-branches');
	const paidBranch = await call(
		[{ json: { goodsGross: 1000, price: 350, qty: 1, discountPercent: 0 } }],
		30,
		'РасчетДоставки',
		branchesPath,
	);
	assert.equal(paidBranch[0].json.branch, 'delivery');
	assert.equal(kopeks(paidBranch[0].json.gross), 35000);

	console.log('check-autumn: ok');
} finally {
	closeAutumnSessions();
	await new Promise((resolve) => setTimeout(resolve, 400));
	for (const directory of tempDirs) {
		for (let attempt = 0; attempt < 5; attempt += 1) {
			try {
				await rm(directory, { recursive: true, force: true });
				break;
			} catch (error) {
				if (attempt === 4) {
					throw error;
				}
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		}
	}
}
