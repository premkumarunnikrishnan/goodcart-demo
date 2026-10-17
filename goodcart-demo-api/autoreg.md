# GoodCart — AutoReg API Specification

## Application Context

GoodCart exposes a tiny local API for reading, creating, and updating demo orders. The app is built with a native Node.js HTTP server and stores orders in `data/orders.json` or a Vercel Blob-backed environment when deployed.

**Base URL:** `http://127.0.0.1:3000/api`
**Spec type:** api
**API style:** REST
**Content type:** `application/json`
**Auth scheme:** none
**Tech stack:** Node.js + native HTTP server; JSON file persistence
**Project folder:** `c:\Gitrepo\MyShopApp`
**App source:** `c:\Gitrepo\MyShopApp`
**Generated:** 2026-10-05

---

## Environment & Prerequisites

- API must be running at `http://127.0.0.1:3000`
- Health check: no dedicated health endpoint found
- Writes allowed: yes, for creating orders and updating status
- Cleanup: created records remain in the local JSON file unless removed manually
- Rate limits: none found
- Idempotency: none found
- Out of scope: real payment processing, auth, email, webhooks

---

## Authentication & Test Accounts

No authentication is enforced for any API route.

| Role | Identifier | Credential | Source | Notes |
|------|-----------|------------|--------|-------|
| public | anonymous | none | app code | all endpoints are open |

---

## Endpoint Inventory

### `GET /api/orders`

- Purpose: list stored orders in newest-first order
- Status: `200 OK`
- Response: array of order objects
- Auth: public

### `POST /api/orders`

- Purpose: create a new order from a cart payload
- Request body:

```json
{
  "customer": {
    "email": "qa.autoreg@example.com",
    "firstName": "Test",
    "lastName": "User",
    "address": "123 Demo St",
    "city": "Seattle",
    "state": "WA",
    "zip": "98101"
  },
  "items": [{ "id": 1, "quantity": 2 }]
}
```

- Validation:
  - `items` must be an array with 1 to 50 entries
  - each item must have integer `quantity` from 1 to 99
  - `customer.email` must match email pattern
  - `customer` must include `firstName`, `lastName`, `address`, `city`, `state`, `zip` as non-empty trimmed strings
- Success: `201 Created`
- Failure: `400 Bad Request` with `{ "error": "Cart is empty or invalid." }` or `{ "error": "Please complete the delivery details." }`

### `PATCH /api/order-status`

- Purpose: update an order status by ID using the legacy single-route format
- Request body:

```json
{ "id": "GC-1234ABCD", "status": "Shipped" }
```

- Allowed status values: `Processing`, `Shipped`, `Completed`
- Success: `200 OK`
- Missing order: `404 Not Found` with `{ "error": "Order not found." }`
- Invalid request: `400 Bad Request` with `{ "error": "Invalid order or status." }`

### `PATCH /api/orders/:id/status`

- Purpose: update status by resource-style URL
- Validation: `id` must match `GC-[A-F0-9]{8}`
- Allowed status values: `Processing`, `Shipped`, `Completed`
- Success: `200 OK`
- Missing order: `404 Not Found` with `{ "error": "Order not found." }`
- Invalid status: `400 Bad Request` with `{ "error": "Invalid status." }`

---

## Request & Response Models

### Order object

```json
{
  "id": "GC-1234ABCD",
  "createdAt": "2026-10-05T00:00:00.000Z",
  "status": "Processing",
  "customer": {
    "email": "qa.autoreg@example.com",
    "firstName": "Test",
    "lastName": "User",
    "address": "123 Demo St",
    "city": "Seattle",
    "state": "WA",
    "zip": "98101"
  },
  "items": [{ "id": 1, "name": "Everyday Ceramic Mug", "price": 24, "quantity": 2, "lineTotal": 48 }],
  "subtotal": 48,
  "shipping": 0,
  "total": 48
}
```

---

## Test Data Catalog

| Key | Value | Source |
|-----|-------|--------|
| `order_id_valid` | `GC-1234ABCD` | generated |
| `order_id_invalid` | `ABC-123` | generated |
| `status_valid` | `Shipped` | generated |
| `status_invalid` | `Delayed` | generated |
| `customer_email` | `qa.autoreg@example.com` | generated |
| `customer_first_name` | `Test` | generated |
| `customer_last_name` | `User` | generated |
| `customer_address` | `123 Demo St` | generated |
| `customer_city` | `Seattle` | generated |
| `customer_state` | `WA` | generated |
| `customer_zip` | `98101` | generated |
| `product_item_id` | `1` | seed |
| `product_item_qty` | `2` | generated |
| `invalid_email` | `not-an-email` | generated |

---

## Invalid Variants

- Missing/invalid `customer.email` → `400` with message from API validation
- Empty `items` array → `400` with `Cart is empty or invalid.`
- Missing required customer details → `400` with `Please complete the delivery details.`
- Invalid `status` value → `400` with `Invalid order or status.` or `Invalid status.`
- Unknown order ID → `404` with `Order not found.`

---

## Scenario Plan

1. `TC-API-001` `GET /api/orders` returns an array of orders (or empty array when no data exists)
2. `TC-API-002` `POST /api/orders` creates a valid order and returns `201`
3. `TC-API-003` `POST /api/orders` rejects invalid payloads and returns `400`
4. `TC-API-004` `PATCH /api/order-status` updates an order to `Shipped` and returns the updated object
5. `TC-API-005` `PATCH /api/order-status` rejects malformed IDs or statuses with `400`
6. `TC-API-006` `PATCH /api/orders/:id/status` returns `404` for a missing order ID

---

## Open Questions

- No `.ar` manifest or workflow folder exists in this repository, so this spec is written directly from the app code as a local workflow artifact.
- Hosted Vercel Blob mode may behave differently from the local JSON mode when `BLOB_READ_WRITE_TOKEN` is configured.
- The app exposes no auth or versioning layer; this is a demo-only API contract.