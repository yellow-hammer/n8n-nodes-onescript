import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AutumnProtocolError, FRAME_PREFIX, encodeCall, parseFrame } = require(
	'../dist/nodes/OneScript/autumnProtocol.js',
);

const encoded = encodeCall('РасчетЗаказа', [{ json: { name: 'Стул' } }]);
assert.equal(encoded.startsWith(FRAME_PREFIX), true);
assert.equal(encoded.includes('\n'), false);
assert.deepEqual(JSON.parse(encoded.slice(FRAME_PREFIX.length)), {
	acorn: 'РасчетЗаказа',
	items: [{ json: { name: 'Стул' } }],
});

assert.deepEqual(parseFrame('@@N8N {"ready":true}'), { kind: 'ready' });
assert.deepEqual(parseFrame('\uFEFF@@N8N {"ok":true,"body":[{"json":{"a":1}}]}'), {
	kind: 'result',
	body: [{ json: { a: 1 } }],
});
assert.deepEqual(parseFrame('@@N8N {"ok":true,"body":null}'), { kind: 'result', body: null });
assert.deepEqual(parseFrame('@@N8N {"ok":false,"error":"нет цены"}'), {
	kind: 'error',
	error: 'нет цены',
});
assert.equal(parseFrame('шум из Сообщить'), undefined);
assert.equal(parseFrame('   '), undefined);
assert.throws(() => parseFrame('@@N8N {'), AutumnProtocolError);
assert.throws(() => parseFrame('@@N8N {"acorn":"X"}'), AutumnProtocolError);

console.log('check-autumn-protocol: ok');
