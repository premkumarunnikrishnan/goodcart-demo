const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const ordersFile = process.env.GOODCART_ORDERS_FILE || path.join(root, 'data', 'orders.json');
const port = Number(process.env.PORT || 3000);
const catalog = new Map([
  [1, ['Everyday Ceramic Mug', 24]], [2, ['Cloud Soft Throw', 49]],
  [3, ['Daily Carry Tote', 32]], [4, ['Wireless Headphones', 89]],
  [5, ['Minimal Desk Lamp', 68]], [6, ['Hydration Bottle', 28]],
  [7, ['Portable Speaker', 59]], [8, ['Fresh Start Notebook', 18]],
  [9, ['Modern Planter', 35]], [10, ['Weekend Sunglasses', 42]],
  [11, ['Desktop Organizer', 26]], [12, ['Cozy Reading Light', 22]]
]);
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/orders.html', ['orders.html', 'text/html; charset=utf-8']],
  ['/admin.html', ['admin.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/orders.js', ['orders.js', 'text/javascript; charset=utf-8']],
  ['/admin.js', ['admin.js', 'text/javascript; charset=utf-8']]
]);
let writeQueue = Promise.resolve();

function send(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store'});
  res.end(body);
}
async function readOrders() {
  try { return JSON.parse(await fs.readFile(ordersFile, 'utf8')).map(order => ({...order, status:order.status === 'New' ? 'Processing' : order.status})); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function publicOrder(order) {
  const {cleanupToken, cleanupTokenHash, ...visible} = order;
  return visible;
}
function isTestEmail(email) {
  return /^(?:qa\.autoreg|autoreg(?:\+[^@]+)?)@example\.com$/i.test(email || '');
}
function isTestOrder(order) {
  return isTestEmail(order?.customer?.email);
}
function canCleanupOrder(order, token) {
  if (!order || !isTestOrder(order) || !/^[a-f0-9]{64}$/.test(token || '') || !/^[a-f0-9]{64}$/.test(order.cleanupTokenHash || '')) return false;
  const hash = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(hash, Buffer.from(order.cleanupTokenHash, 'hex'));
}
function updateOrders(change) {
  const task = writeQueue.then(async () => {
    const orders = await readOrders();
    const result = change(orders);
    await fs.mkdir(path.dirname(ordersFile), {recursive:true});
    const temporary = ordersFile + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(orders, null, 2));
    await fs.rename(temporary, ordersFile);
    return result;
  });
  writeQueue = task.catch(() => {});
  return task;
}
async function bodyJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10000) throw new Error('Request is too large.');
  }
  try { return JSON.parse(body); } catch { throw new Error('Invalid JSON.'); }
}
function validText(value, max = 120) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }
function createOrder(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw new Error('Cart is empty or invalid.');
  const customer = input.customer;
  if (!customer || !validText(customer.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || !['firstName','lastName','address','city','state','zip'].every(key => validText(customer[key]))) throw new Error('Please complete the delivery details.');
  const items = input.items.map(item => {
    const product = catalog.get(item.id);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error('Cart contains an invalid product or quantity.');
    return {id:item.id, name:product[0], price:product[1], quantity:item.quantity, lineTotal:product[1]*item.quantity};
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = subtotal >= 75 ? 0 : 7.95;
  const cleanupToken = isTestEmail(customer.email.trim()) ? crypto.randomBytes(32).toString('hex') : null;
  return {
    id:'GC-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    createdAt:new Date().toISOString(), status:'Processing',
    customer:Object.fromEntries(['email','firstName','lastName','address','city','state','zip'].map(key => [key,customer[key].trim()])),
    items, subtotal, shipping, total:Math.round((subtotal + shipping)*100)/100,
    ...(cleanupToken ? {cleanupToken, cleanupTokenHash:crypto.createHash('sha256').update(cleanupToken).digest('hex')} : {})
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/orders' && req.method === 'GET') return send(res, 200, (await readOrders()).map(publicOrder));
    if (pathname === '/api/orders' && req.method === 'POST') {
      const order = createOrder(await bodyJson(req));
      const {cleanupToken, ...storedOrder} = order;
      await updateOrders(orders => { orders.unshift(storedOrder); return storedOrder; });
      return send(res, 201, {...publicOrder(storedOrder), ...(cleanupToken ? {cleanupToken} : {})});
    }
    if (pathname === '/api/order-cleanup' && req.method === 'DELETE') {
      const {id, token} = await bodyJson(req);
      if (!/^GC-[A-F0-9]{8}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(token || '')) return send(res, 400, {error:'Invalid cleanup request.'});
      const deleted = await updateOrders(orders => {
        const index = orders.findIndex(order => order.id === id);
        if (index < 0 || !canCleanupOrder(orders[index], token)) return false;
        orders.splice(index, 1);
        return true;
      });
      return deleted ? send(res, 200, {id, deleted:true}) : send(res, 404, {error:'Test order not found or cleanup token is invalid.'});
    }
    if (pathname === '/api/order-status' && req.method === 'PATCH') {
      const input = await bodyJson(req);
      if (!/^GC-[A-F0-9]{8}$/.test(input.id || '') || !['Processing','Shipped','Completed'].includes(input.status)) return send(res, 400, {error:'Invalid order or status.'});
      const updated = await updateOrders(orders => {
        const order = orders.find(o => o.id === input.id);
        if (order) order.status = input.status;
        return order || null;
      });
      return updated ? send(res, 200, updated) : send(res, 404, {error:'Order not found.'});
    }
    const statusMatch = pathname.match(/^\/api\/orders\/(GC-[A-F0-9]{8})\/status$/);
    if (statusMatch && req.method === 'PATCH') {
      const input = await bodyJson(req);
      if (!['Processing','Shipped','Completed'].includes(input.status)) return send(res, 400, {error:'Invalid status.'});
      const updated = await updateOrders(orders => {
        const order = orders.find(o => o.id === statusMatch[1]);
        if (order) order.status = input.status;
        return order || null;
      });
      return updated ? send(res, 200, updated) : send(res, 404, {error:'Order not found.'});
    }
    if (req.method === 'GET' && staticFiles.has(pathname)) {
      const [filename, contentType] = staticFiles.get(pathname);
      const content = await fs.readFile(path.join(root, filename));
      res.writeHead(200, {'content-type':contentType,'content-length':content.length});
      return res.end(content);
    }
    send(res, 404, {error:'Not found.'});
  } catch (error) {
    send(res, error.message === 'Invalid JSON.' || error.message === 'Request is too large.' || error.message.startsWith('Cart ') || error.message.startsWith('Please ') ? 400 : 500, {error:error.message});
  }
});
if (require.main === module) server.listen(port, '127.0.0.1', () => console.log(`GoodCart running at http://127.0.0.1:${port}`));
module.exports = {server,createOrder,publicOrder,canCleanupOrder};
