import {get, put} from '@vercel/blob';

const response = (value, status = 200) => Response.json(value, {status, headers:{'cache-control':'no-store'}});

export async function PATCH(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response({error:'Order storage is not connected.'}, 503);
  try {
    const {id,status} = await request.json();
    if (!/^GC-[A-F0-9]{8}$/.test(id || '') || !['New','Processing','Completed'].includes(status)) return response({error:'Invalid order or status.'}, 400);
    const pathname = `orders/${id}.json`;
    const result = await get(pathname, {access:'private'});
    if (!result || result.statusCode !== 200) return response({error:'Order not found.'}, 404);
    const order = await new Response(result.stream).json();
    order.status = status;
    await put(pathname, JSON.stringify(order), {access:'private', contentType:'application/json', allowOverwrite:true, cacheControlMaxAge:0});
    return response(order);
  } catch { return response({error:'Could not update status.'}, 500); }
}
