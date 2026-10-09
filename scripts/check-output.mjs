import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { stdoutToItems, textResultItem } = require('../dist/nodes/OneScript/output.js');

const empty = stdoutToItems('   \n');
assert.equal(empty.kind, 'text');

const text = stdoutToItems('не json');
assert.equal(text.kind, 'text');

const objectItem = stdoutToItems('{"name":"Товар"}');
assert.equal(objectItem.kind, 'items');
assert.deepEqual(objectItem.items, [{ json: { name: 'Товар' } }]);

const n8nItems = stdoutToItems('[{"json":{"a":1}},{"json":{"b":2}}]');
assert.equal(n8nItems.kind, 'items');
assert.deepEqual(n8nItems.items, [{ json: { a: 1 } }, { json: { b: 2 } }]);

const mixed = stdoutToItems('[{"json":{"a":1}},{"b":2},1]');
assert.deepEqual(mixed.items, [{ json: { a: 1 } }, { json: { b: 2 } }, { json: { value: 1 } }]);

const primitive = stdoutToItems('  null  ');
assert.deepEqual(primitive.items, [{ json: { value: null } }]);

const bom = stdoutToItems('\uFEFF[ ]');
assert.equal(bom.kind, 'items');
assert.deepEqual(bom.items, []);

const invalidJsonField = stdoutToItems('{"json":[1,2]}');
assert.deepEqual(invalidJsonField.items, [{ json: { json: [1, 2] } }]);

const fallback = textResultItem('hello', 'warn', 0);
assert.deepEqual(fallback, { json: { stdout: 'hello', stderr: 'warn', exitCode: 0 } });

console.log('check-output: ok');
