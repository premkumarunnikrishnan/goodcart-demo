import {get, list, put} from '@vercel/blob';
import localServer from '../server.js';

const {createReview} = localServer;
const options = {access:'private'};
const response = (value, status = 200) => Response.json(value, {status, headers:{'cache-control':'no-store'}});

async function readReview(pathname) {
  const result = await get(pathname, options);
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).json();
}

export async function GET(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response({error:'Review storage is not connected.'}, 503);
  try {
    const productId = new URL(request.url).searchParams.get('productId');
    if (productId !== null && (!/^\d+$/.test(productId) || Number(productId) < 1 || Number(productId) > 12)) return response({error:'Review product is invalid.'}, 400);
    const prefix = productId === null ? 'reviews/' : `reviews/${Number(productId)}/`;
    const reviews = [];
    let cursor;
    do {
      const page = await list({prefix, limit:100, cursor});
      reviews.push(...(await Promise.all(page.blobs.map(blob => readReview(blob.pathname)))).filter(Boolean));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    reviews.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    return response(reviews);
  } catch { return response({error:'Could not load reviews.'}, 500); }
}

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response({error:'Review storage is not connected.'}, 503);
  try {
    const review = createReview(await request.json());
    await put(`reviews/${review.productId}/${review.id}.json`, JSON.stringify(review), {...options, contentType:'application/json', addRandomSuffix:false, cacheControlMaxAge:0});
    return response(review, 201);
  } catch (error) {
    const invalidReview = error.message?.startsWith('Review ');
    const invalidJson = error instanceof SyntaxError;
    return response({error:invalidReview ? error.message : invalidJson ? 'Invalid JSON.' : 'Could not save review.'}, invalidReview || invalidJson ? 400 : 500);
  }
}
