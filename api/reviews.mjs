import {get, list, put} from '@vercel/blob';
import localServer from '../server.js';

const {createReview} = localServer;
const options = {access:'private'};
const response = (value, status = 200) => Response.json(value, {status, headers:{'cache-control':'no-store'}});

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response({error:'Review storage is not connected.'}, 503);
  try {
    const reviews = [];
    let cursor;
    do {
      const page = await list({prefix:'reviews/', limit:100, cursor});
      const entries = await Promise.all(page.blobs.map(async blob => {
        const result = await get(blob.pathname, options);
        return result?.statusCode === 200 ? new Response(result.stream).json() : null;
      }));
      reviews.push(...entries.filter(Boolean));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    const userError = error.message.startsWith('Please ');
    return response({error:userError ? error.message : 'Could not save review.'}, userError ? 400 : 500);
  }
}
