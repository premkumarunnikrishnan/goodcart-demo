const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');

const temporary = mkdtempSync(path.join(tmpdir(), 'goodcart-cleanup-'));
process.env.GOODCART_ORDERS_FILE = path.join(temporary, 'orders.json');
const {server} = require('../server');

test('only the matching token can delete a new synthetic test order', async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(temporary, {recursive:true, force:true});
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const customer = {email:'qa.autoreg@example.com', firstName:'Avery', lastName:'Test', address:'123 Demo Lane', city:'Albany', state:'NY', zip:'12207'};
  const create = await fetch(`${base}/api/orders`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({customer, items:[{id:1, quantity:1}]})});
  assert.equal(create.status, 201);
  const order = await create.json();
  assert.match(order.cleanupToken, /^[a-f0-9]{64}$/);

  const listed = await (await fetch(`${base}/api/orders`)).json();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].cleanupToken, undefined);
  assert.equal(listed[0].cleanupTokenHash, undefined);

  const remove = token => fetch(`${base}/api/order-cleanup`, {method:'DELETE', headers:{'content-type':'application/json'}, body:JSON.stringify({id:order.id, token})});
  assert.equal((await remove('0'.repeat(64))).status, 404);
  assert.equal((await (await fetch(`${base}/api/orders`)).json()).length, 1);
  assert.equal((await remove(order.cleanupToken)).status, 200);
  assert.equal((await (await fetch(`${base}/api/orders`)).json()).length, 0);
});

test('ordinary orders never receive a cleanup token', async t => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(temporary, {recursive:true, force:true});
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const customer = {email:'shopper@example.com', firstName:'Avery', lastName:'Shopper', address:'123 Demo Lane', city:'Albany', state:'NY', zip:'12207'};
  const create = await fetch(`${base}/api/orders`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({customer, items:[{id:1, quantity:1}]})});
  const order = await create.json();
  assert.equal(order.cleanupToken, undefined);
  const result = await fetch(`${base}/api/order-cleanup`, {method:'DELETE', headers:{'content-type':'application/json'}, body:JSON.stringify({id:order.id, token:'0'.repeat(64)})});
  assert.equal(result.status, 404);
});
