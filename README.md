# GoodCart demo

A small storefront with product browsing, a cart, demo checkout, and locally saved orders.

## Run

Requires Node.js 18 or newer. From this folder:

```sh
npm start
```

Open <http://127.0.0.1:3000>. The Orders link shows saved orders with read-only statuses. New orders start as Processing. Use the Admin link on the Orders page (or open /admin.html) to enter an order ID and set its status to Processing, Shipped, or Completed. The server saves orders to `data/orders.json` on this computer.

Open any product to read its reviews or add one with a star rating, name, and review text. Products without reviews show an Add a review link in the catalog and product details. Reviews are saved to `data/reviews.json` on this computer, and submitted ratings update the catalog.

Orders placed with `qa.autoreg@example.com` or an `autoreg+...@example.com` address receive a one-time cleanup token. In the same browser tab, the Orders page shows **Delete demo order** for those orders so a test can remove its order after checking the saved result. The token stays in session storage and is required by `DELETE /api/order-cleanup`; other orders cannot be deleted through this endpoint.

Use dummy card details such as `4242 4242 4242 4242`, `12/28`, and `123`. The card fields are checked in the browser and are **not sent to the server or saved**. No payment is processed.

This is a local demo. The order list and admin status updates have no authentication, so keep the server bound to localhost as configured. Orders and delivery details are stored in plain JSON; use a database and authentication before deploying it publicly.

## Vercel

The `api/` functions use a **private Vercel Blob store** for hosted orders and reviews. Connect a private Blob store to the Vercel project so `BLOB_READ_WRITE_TOKEN` is available to its functions. Without it, checkout and review submissions return an error. The hosted Orders, Admin, and review submission pages have no authentication, so do not use real customer details in this demo.

To deploy the current local files to the linked production project, run:

```sh
npm run deploy
```

Sign in first with `npx vercel login` if using a new machine, then link the project with `npx vercel link --yes --project goodcart-demo`. This command deploys directly to Vercel; push commits to GitHub separately.
