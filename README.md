# GoodCart demo

A small storefront with product browsing, a cart, demo checkout, and locally saved orders.

## Run

Requires Node.js 18 or newer. From this folder:

```sh
npm start
```

Open <http://127.0.0.1:3000>. The Orders link shows saved orders and lets you update their status. The server saves orders to `data/orders.json` on this computer.

Use dummy card details such as `4242 4242 4242 4242`, `12/28`, and `123`. The card fields are checked in the browser and are **not sent to the server or saved**. No payment is processed.

This is a local demo. The order list has no authentication, so keep the server bound to localhost as configured. Orders and delivery details are stored in plain JSON; use a database and authentication before deploying it publicly.

## Vercel

The `api/` functions use a **private Vercel Blob store** for hosted orders. Connect a private Blob store to the Vercel project so `BLOB_READ_WRITE_TOKEN` is available to its functions. Without it, checkout returns an error and leaves the cart intact. The hosted Orders page has no authentication, so do not use real customer details in this demo.
