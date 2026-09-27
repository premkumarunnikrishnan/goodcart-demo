import {get, list, put} from '@vercel/blob';
import localServer from '../server.js';

const {createOrder} = localServer;
const options = {access:'private'};
const response = (value, status = 200) => Response.json(value, {status, headers:{'cache-control':'no-store'}});

async function readOrder(pathname) {
  const result = await get(pathname, options);
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).json();
}

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response({error:'Order storage is not connected.'}, 503);
  try {
    const orders = [];
    let cursor;
    do {
      const page = await list({prefix:'orders/', limit:100, cursor});
      orders.push(...(await Promise.all(page.blobs.map(blob => readOrder(blob.pathname)))).filter(Boolean));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    orders.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    return response(orders);
  } catch { return response({error:'Could not load orders.'}, 500); }
}

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response({error:'Order storage is not connected.'}, 503);
  try {
    const order = createOrder(await request.json());
    await put(`orders/${order.id}.json`, JSON.stringify(order), {...options, contentType:'application/json', addRandomSuffix:false, cacheControlMaxAge:0});
    return response(order, 201);
  } catch (error) {
    const userError = /^(Cart |Please )/.test(error.message);
    return response({error:userError?error.message:'Could not save order.'}, userError?400:500);
  }
}
