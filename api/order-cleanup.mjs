import {get, del} from '@vercel/blob';
import localServer from '../server.js';

const {canCleanupOrder} = localServer;
const response = (value, status = 200) => Response.json(value, {status, headers:{'cache-control':'no-store'}});

export async function DELETE(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response({error:'Order storage is not connected.'}, 503);
  try {
    const {id, token} = await request.json();
    if (!/^GC-[A-F0-9]{8}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(token || '')) return response({error:'Invalid cleanup request.'}, 400);
    const pathname = `orders/${id}.json`;
    const result = await get(pathname, {access:'private'});
    if (!result || result.statusCode !== 200) return response({error:'Test order not found or cleanup token is invalid.'}, 404);
    const order = await new Response(result.stream).json();
    if (!canCleanupOrder(order, token)) return response({error:'Test order not found or cleanup token is invalid.'}, 404);
    await del(pathname);
    return response({id, deleted:true});
  } catch {
    return response({error:'Could not delete test order.'}, 500);
  }
}
