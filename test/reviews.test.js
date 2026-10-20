const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, readFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');

const temporary = mkdtempSync(path.join(tmpdir(), 'goodcart-reviews-'));
const reviewsFile = path.join(temporary, 'reviews.json');
process.env.GOODCART_REVIEWS_FILE = reviewsFile;
const {server} = require('../server');
let base;

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  rmSync(temporary, {recursive:true, force:true});
});

test('reviews can be submitted, listed by product, and persisted safely', async () => {
  const create = (value) => fetch(`${base}/api/reviews`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(value)});
  const first = await create({productId:1, rating:5, name:'  Alex  ', comment:'  Lovely mug.  '});
  assert.equal(first.status, 201);
  const review = await first.json();
  assert.match(review.id, /^RV-[A-F0-9]{16}$/);
  assert.equal(review.name, 'Alex');
  assert.equal(review.comment, 'Lovely mug.');
  assert.equal(typeof review.createdAt, 'string');

  const second = await create({productId:2, rating:3, name:'Sam', comment:'Comfortable.'});
  assert.equal(second.status, 201);
  const productReviews = await fetch(`${base}/api/reviews?productId=1`);
  assert.equal(productReviews.status, 200);
  assert.deepEqual((await productReviews.json()).map(item => item.id), [review.id]);
  const allReviews = await fetch(`${base}/api/reviews`);
  assert.equal((await allReviews.json()).length, 2);
  assert.deepEqual(JSON.parse(readFileSync(reviewsFile, 'utf8')).map(item => item.id).sort(), [review.id, (await second.json()).id].sort());
});

test('review submission rejects invalid products, ratings, names, and comments', async () => {
  const invalid = [
    {productId:99, rating:5, name:'Alex', comment:'Good.'},
    {productId:1, rating:0, name:'Alex', comment:'Good.'},
    {productId:1, rating:5.5, name:'Alex', comment:'Good.'},
    {productId:1, rating:5, name:'A', comment:'Good.'},
    {productId:1, rating:5, name:'Alex', comment:'  '},
    {productId:1, rating:5, name:'x'.repeat(61), comment:'Good.'},
    {productId:1, rating:5, name:'Alex', comment:'x'.repeat(1001)}
  ];
  for (const payload of invalid) {
    const result = await fetch(`${base}/api/reviews`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)});
    assert.equal(result.status, 400, JSON.stringify(payload));
  }
  assert.equal((await fetch(`${base}/api/reviews?productId=999`)).status, 400);
  const malformed = await fetch(`${base}/api/reviews`, {method:'POST', headers:{'content-type':'application/json'}, body:'{'});
  assert.equal(malformed.status, 400);
});

test('simultaneous review submissions are all persisted', async () => {
  const submissions = Array.from({length:4}, (_, index) => fetch(`${base}/api/reviews`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({productId:4, rating:index+1, name:`Buyer ${index}`, comment:`Review ${index}`})
  }));
  const responses = await Promise.all(submissions);
  assert.ok(responses.every(response => response.status === 201));
  const result = await fetch(`${base}/api/reviews?productId=4`);
  assert.equal((await result.json()).length, 4);
  assert.equal(JSON.parse(readFileSync(reviewsFile, 'utf8')).filter(review => review.productId === 4).length, 4);
});
