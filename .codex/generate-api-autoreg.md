Generate a complete, production-grade `autoreg.md` **API test specification** for an AutoReg project. This file is the single source of truth the AutoReg agent uses to generate HTTP API tests that pass on the first run — without a browser — so it must contain only facts extracted from live source code (endpoints, request and response models, validation rules, authentication, error contracts), plus test data that is either confirmed by the user or deterministically generated.

Every fact in the file must come from live source code read during THIS run — never copy analysis forward from an existing `autoreg.md` on trust. What DOES carry forward, in every mode, is user input: values in `## Test Data Catalog` marked `Source: user` and answered `## Open Questions` are the user's, not stale analysis. Never re-ask what they already answered.

This skill is normally dispatched by the `generate-autoreg` router (which decides whether a project is a UI, an API or both); it can also be run directly. Its sibling `generate-ui-autoreg` produces the browser-driven UI spec — never mix the two into one file.

Skill version: 1.0.1

---

## Mode decision — do this after resolving the paths below, BEFORE source analysis

This skill runs in one of three modes. Pick one by looking at what is already on disk in the project folder, then follow only that mode's phases.

| On disk | Flag given | Mode | What to run |
|---|---|---|---|
| No `autoreg.md`, no `.autoreg/baseline.json` | any | **FULL** | Phases 0–9 |
| `autoreg.md` exists, but NO `.autoreg/baseline.json` | none | **BOOTSTRAP** → then DELTA | Phase B (adopt the existing spec), then D0–D10 |
| Both exist, baseline valid, `specKind` is `"api"` (or absent and the spec has `**Spec type:** api`) | none or `--delta` | **DELTA** | Phases D0–D10 |
| Both exist, baseline `specKind` is `"ui"` | any | **STOP** | This folder holds a UI workflow. Generate the API spec in the API source subfolder and its separately derived private API workflow. Never overwrite a UI spec with an API spec. |
| Both exist | `--full` | **FULL** | Phases 0–9, but preserve scenario IDs by coverage key (see Phase 5.5) |
| Baseline corrupt, unreadable, or `schemaVersion` newer than 1 | any | **FULL** | Say why in one line. Salvage `dataCatalog` + `openQuestions` from it first if the JSON parses at all |
| DELTA finds more than 60% of features impacted | — | **recommend FULL** | Ask the user; non-interactively just run FULL and say so in the summary |

Announce the chosen mode in one line before you start work, e.g. `Mode: delta (baseline v2 → v3)`.

**Never** regenerate every scenario when the baseline is usable. Rewriting scenarios that nothing in the API touched is how stable, working tests get silently broken.

---

## Inputs from $ARGUMENTS

For the mode table above, check `<app source root>/autoreg.md` for the spec and `<internal workflow>/.autoreg/baseline.json` for the baseline. A baseline with an unsupported newer schema must stop generation until the skill is updated; do not replace it with a full run.

The app source is the current workspace root. Never ask for a workflow folder or app source path when invoked without paths. The router passes the derived internal workflow path first and the app source root second. When invoked directly, derive the internal workflow using the shared algorithm in `generate-autoreg` for kind `api`. Treat explicit extra paths as additional source roots. The directory containing the uploadable `autoreg.md` is the identity root used by the desktop app and extension. Keep all generated artifacts other than that source `autoreg.md` inside the hidden workflow. Read the source `autoreg.md` as authoritative and keep a signed copy in the hidden workflow for desktop processing.

---

## Phase 0 — Clarify with the user (ALWAYS do this first)

Before deep analysis, do a quick 2-minute scan of the API (route registrations, auth middleware, `.env.example`, server config) and then ASK the user the questions below. Batch them into ONE message — do not drip-feed. Only ask questions the scan could not answer.

1. **Environment** — "Is the API running at `[url from .ar manifest / config]` (including the global prefix such as `/api/v1`)? Which environment should tests target (local / staging)? May tests ignore TLS certificate errors?"
2. **Authentication** — name the scheme you found (Bearer/JWT, session cookie, API key header, OAuth client-credentials, basic). For each role the API distinguishes: "Provide credentials, or a pre-issued token? Should scenarios obtain their own token through `[login endpoint]` (recommended — every scenario stays self-contained), or use a static `{{auth_token}}`?" NEVER invent credentials or tokens for an API with a real backend.
3. **Writes** — "May scenarios create, update and delete records? Which endpoints must NOT be called (payments, outbound email, webhooks, admin resets)? Is there a cleanup endpoint, or must each scenario delete what it created?"
4. **Seed / fixture data** — If the API serves lists, lookups or search: "Is the data set fixed (seeded)? Share known record ids, list sizes, and search terms with their result counts."
5. **Sample payloads** — For any domain-specific request body found (addresses, card tokens, licence keys, file uploads): "Provide valid sample values, or should I generate synthetic ones?"
6. **Limits** — "Are there rate limits scenarios must stay under, or idempotency-key headers that writes require?"

Handling the answers:
- Record every user-provided value in the `## Test Data Catalog` section with `Source: user`.
- If the user says "generate it", produce realistic synthetic values (`Source: generated`) — see Phase 4.
- If running non-interactively (no user available, e.g. CI), do NOT block: proceed with generated data, mark every unconfirmed assumption in the `## Open Questions` section, and prefer read-only scenarios over destructive ones.

---

## Phase 1 — Read the project manifest

Search the project folder for a file ending in `.ar` (e.g. `myapi.ar`). Read it as JSON and extract:
- `sources[0].url` — base URL of the API under test
- `sources[0].name` — display name
- `sources[0].autoregMd` — relative path where `autoreg.md` lives (default: `"autoreg.md"`)
- `metadata.name` — project name

If no `.ar` file exists yet, use the app source folder name as the project name and `<app source root>/autoreg.md` as the output path. The desktop app creates the manifest under the hidden workflow when that signed spec is imported. The base URL comes from Phase 0 / server config.

---

## Phase 2 — Detect the API stack, then discover source files

First read `package.json` / `requirements.txt` / `pyproject.toml` / `Gemfile` / `composer.json` / `pom.xml` / `build.gradle` / `*.csproj` / `go.mod` to identify the framework. Then scan the matching file set (search recursively; skip `node_modules/`, `vendor/`, `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `.svelte-kit/`, `.output/`, `target/`, `bin/`, `obj/`, `coverage/`, `__pycache__/`, `.git/`):

| Stack | Route sources | Model / validation sources |
|-------|---------------|----------------------------|
| Express / Koa / Fastify / Hono / Hapi / Restify | `app.get|post|put|patch|delete`, `router.*`, `fastify.route`, `app.route()`; mount prefixes (`app.use("/api", …)`) | Zod / Joi / Yup / Ajv / class-validator schemas, TypeScript types on `req.body`, Fastify route `schema` |
| NestJS | `@Controller`, `@Get|@Post|@Put|@Patch|@Delete`, `setGlobalPrefix` in `main.ts`, versioning | DTOs + class-validator, `@nestjs/swagger` decorators |
| Next.js / Nuxt / SvelteKit / Remix | `app/api/**/route.ts` (`GET|POST` exports), `pages/api/**`, `server/api/**`, `+server.ts`, resource routes | inline Zod, shared `lib/schemas` |
| tRPC | router definitions (`.query`, `.mutation`), `input(z.…)` | tRPC input/output schemas → document as `POST /trpc/<procedure>` with the JSON envelope |
| GraphQL (Apollo / Yoga / Mercurius) | schema SDL, resolvers | SDL types → document as `POST /graphql` operations with query strings and variables |
| Django / DRF, Flask, FastAPI, Starlette | `urls.py`, `@app.route`, `@router.get`, `APIRouter(prefix=…)`, `include_router` | DRF serializers, Pydantic models, marshmallow schemas |
| Rails / Sinatra / Grape | `config/routes.rb` (`namespace :api`, `resources`), Grape `params do` | strong params, ActiveModel validations, `db/schema.rb` |
| Laravel | `routes/api.php`, resource controllers, `Route::prefix` | FormRequest `rules()`, Eloquent models |
| Spring | `@RestController`, `@RequestMapping` + `@GetMapping|@PostMapping|…`, `server.servlet.context-path` | `@Valid` DTOs, Bean Validation annotations, JPA entities |
| ASP.NET | `[ApiController]`, `[Route]`, `[HttpGet]…`, minimal-API `MapGet|MapPost|…` | DataAnnotations, FluentValidation, records / DTOs |
| Go (net/http, gin, echo, chi, fiber) | `HandleFunc`, `r.GET`, `e.POST`, route groups | struct tags (`json:"…" validate:"…"`) |
| OpenAPI / Swagger file present | **Read it first** as the endpoint index, then confirm every operation against code — the code wins on disagreement, and each disagreement goes to Open Questions | schemas → Request/Response Models verbatim (YAML/JSON) |

Also always read: auth middleware/guards, error-handling middleware (the global error envelope), pagination helpers, i18n files for error messages, seed/fixture files (`seeds/`, `fixtures/`, `db/seeds*`, `prisma/seed*`, `*.sql` inserts), `.env.example` (never `.env`), CORS / rate-limit config, `docker-compose*` / `Procfile` / `Makefile` for how the API is started, and any existing API tests (`*.spec.*`, `*.test.*`, `*.http`, Postman collections) — they are the best source of example payloads.

**Monorepo:** if the source root contains `apps/` / `packages/` / `services/` workspaces, identify which package is the API under test (matches the `.ar` base URL) and scan it plus any shared packages it imports (DTOs, validation schemas, error codes).

---

## Phase 3 — Extract every technical detail

Read each discovered file and catalogue the following.

### 3a. Endpoints

For every operation record: `METHOD`, the **full** path (mount prefix + router prefix + route; normalise path params to `:param`), handler file and line, purpose, **auth requirement** (public / bearer / api-key / session / role-restricted — read the guard, decorator or middleware chain), consumes/produces content types, path params, query params (name, type, required, default), the request body model, the success status and response model, every error status the handler or its middleware can return and why (validation, not found, forbidden, conflict, rate-limited), side effects (creates / updates / deletes, sends mail, enqueues a job, calls a third party), idempotency behaviour, and any rate limit that applies.

Group endpoints by resource. Include health/readiness endpoints and admin-only endpoints.

### 3b. Request models and validation

Extract every request DTO / schema verbatim (TypeScript, Zod, Joi, Pydantic, serializers, Bean Validation …). Then build a validation table: field → rule (required, min/max, length, regex, enum, format, nullable) → the **exact** status and error code/message the API returns when the rule fails. Read the validator AND the error middleware: the message a client sees is often assembled there, not in the schema. Resolve i18n keys through the locale files. This table feeds negative scenarios and generated test data.

### 3c. Response models

Extract every response type / schema verbatim, per success status. Note enveloping (`{ data, meta }`), pagination shape, date and number formats, nullable fields, and fields that are computed or omitted per role. When a fixture, factory or existing test provides an example response, copy it and cite the file.

### 3d. Error contracts

Document the global error envelope (shape, which field carries the code and the message), per-status shapes, and the exact message strings. Every negative scenario asserts on these — copy them verbatim.

### 3e. Authentication and roles

Document the token flow as concrete request/response pairs: the login / token endpoint, its body, where the token comes back (body path, header, cookie), how it is sent (header name + prefix, cookie name), expiry and refresh, and the failure response for bad credentials. Build the role matrix: role → endpoints it may call → the status for a denied call. Note which roles need which test account.

### 3f. Behaviours

- **Pagination** — params, defaults, maximums, the total-count field, default ordering.
- **Filtering / sorting / search** — params and their exact effect.
- **Ordering dependencies** — create before read, read before update, update before delete; which endpoints return the id a later call needs.
- **Eventual consistency** — any async job between a write and a read (queues, cache invalidation, replication). Cite the source. This is the ONLY justification for a `Wait` step in a scenario.
- **Idempotency** — header name, behaviour on replay.
- **Soft deletes, versioning, ETags / conditional requests** — whatever the code does.

### 3g. Non-testable and out-of-scope surfaces

Flag anything HTTP tests cannot drive deterministically: webhooks / callbacks into third parties, outbound email / SMS, long-running jobs with no status endpoint, streaming / SSE / WebSocket endpoints, multipart file uploads (not supported in this version — say so), OAuth redirect flows, endpoints that hit live payment providers. For each, state the workaround (a sandbox mode, a seeded state, a status endpoint) or "out of scope".

### 3h. Known data

From seed / fixture files: known record ids, list sizes, counts per filter, search terms with known result counts. Cite the file. Only these may be asserted as exact numbers; everything else is asserted qualitatively (`has at least 1 items`).

---

## Phase 4 — Build the Test Data Catalog

Every value any scenario sends (body, query, header, path param) or asserts MUST come from this catalog. Three sources:

1. **`user`** — values the user provided in Phase 0 (credentials, tokens, known records, domain samples). Use them verbatim.
2. **`generated`** — synthetic values you create. Make them realistic AND schema-compliant (respect min/max, regex, enums, formats found in 3b). Conventions:
   - Emails: `qa.autoreg@example.com`; unique-per-run: `autoreg+{{timestamp}}@example.com` (AutoReg resolves `{{timestamp}}` and `{{uuid}}` as built-ins)
   - Names / addresses / phones: realistic fake values (never real people); formats matching the validation rules
   - Payment cards: standard test numbers only, and ONLY against test-mode gateways
   - Object / array values: `Type: json`, the JSON on one line in the Value column
   - Invalid variants: for every validated field, a failing value (key prefixed `invalid_`) — the expected status and message go in `## Invalid Variants`, NOT in the catalog table (see Phase 6)
3. **`seed`** — values read from the app's seed / fixture files (known ids, counts, search terms). Cite the file.

**Placeholders:** if a value is secret or environment-specific and the user did not provide it, write the token `{{key}}` in scenario steps and add a catalog row with `Source: user (pending)`. The AutoReg agent resolves `{{key}}` at run time from its Test Parameters — this is the supported hand-off for managed test data. Never invent real-looking secrets, and never copy values from `.env`.

**Runtime variables** — values a scenario captures from a response with `Save … as {{name}}` (a token, a created id) — are NOT catalog rows. Do not list them; the agent resolves them from the run itself.

---

## Phase 5 — Synthesise before writing

Build these maps before generating the file:

1. **Endpoint inventory** — every operation, grouped by resource, with auth, models, statuses and side effects
2. **Model catalogue** — verbatim request and response definitions + the validation table
3. **Error contract** — envelope + per-status shapes + exact messages
4. **Auth map** — token flow(s), role matrix, which account covers which role
5. **Behaviour map** — pagination, filters, ordering dependencies, eventual consistency, idempotency
6. **Test data catalog** — complete; every request body field has at least one valid and one invalid value; every path param has a known or creatable id
7. **Flow graph** — obtain token → create → read → update → delete → cleanup; role-denied paths; not-found paths; each scenario self-contained anyway
8. **Out-of-scope list** — from 3g, with reasons

---

## Phase 5.5 — Build the baseline model (FULL and BOOTSTRAP modes)

Everything above is thrown away at the end of the run unless you persist it. The baseline is what makes the NEXT run a cheap delta instead of another full regeneration, so build it now, while the analysis is fresh, and write it in Phase 9.

Decompose the API into **features** — one resource or capability each (`auth`, `orders`, `orders-admin`, `search`). Aim for a granularity where a feature maps to 1–6 scenarios and 1–10 files; if a feature owns 20 files it is really several features.

Give every feature a stable kebab-case `id`. **Feature ids are permanent** — once assigned, never rename one, even if the resource is renamed. Renaming breaks the link to its scenarios.

For each feature record: `routes` (`"METHOD /path"` strings), `files`, `types` (request/response model names), `errorTexts` (the exact messages its negatives assert), `dataKeys`, and `dependsOn`. `selectors` is always `[]` for an API feature.

Then record **dependency edges** — directed, `from` depends on `to`, each with a one-line `evidence` string naming the file or guard you read it from. Edge kinds:
- `requires-auth` — the endpoint is behind a guard (→ the auth feature)
- `flow-prerequisite` — B cannot run until A has happened (read/delete needs create; checkout needs cart)
- `uses-type` / `shares-data-entity` — shares a DTO / schema or reads the same table
- `navigates-to` — a response links to another resource (HATEOAS, `nextPage`)

Evidence is not decoration: the next run re-checks these edges, and an edge it cannot verify gets dropped.

Finally assign every scenario a **coverage key** — its canonical intent identity, independent of wording:

```
<feature-id>/<flow-slug>/<positive|negative>[/<variant-slug>]

auth/login/positive
auth/login/negative/invalid-email
orders/create/positive
orders/create/negative/empty-items
orders/list/negative/unauthorized
```

Two rules that make delta mode work:
1. **One active scenario per coverage key, ever.** This is what makes duplicate scenarios structurally impossible.
2. On a `--full` rerun over an existing baseline, match new scenarios to old ones **by coverage key and reuse their TC ids**. IDs survive full rebuilds; that is the point of the key.

TC ids come from `nextScenarioId` and only ever increase. **Never reuse the id of a deprecated scenario** — run history elsewhere still refers to it.

---

## Phase 6 — Write `autoreg.md`

Write the uploadable file to `<app source root>/autoreg.md`, and after signing keep a signed copy at `<internal workflow>/autoreg.md`. Use EXACTLY this structure (omit a section only if genuinely empty — say why in a one-line note):

---

```markdown
# [API Name] — AutoReg API Specification

## Application Context

[2–3 sentences: what the API does, who calls it, its style]

**Base URL:** `[url including any global prefix, e.g. http://localhost:3000/api/v1]`
**Spec type:** api
**API style:** REST | GraphQL | tRPC · **Content type:** application/json
**Auth scheme:** [Bearer JWT via POST /auth/login | API key header X-Api-Key | session cookie | none]
**Tech stack:** [e.g. NestJS 10 + Prisma; PostgreSQL]
**Versioning:** [path /v1 | header | none]
**Project folder:** `[absolute path]`
**App source:** `[absolute path(s)]`
**Generated:** [ISO date] · **Source commit:** [git short SHA if available]

---

## Environment & Prerequisites

- API must be running at `[url]` ([how: npm run start:dev / docker compose up api …])
- Health endpoint: `GET /health` → 200 [or "none found"]
- Database state: [seeded via X | empty | live — counts unreliable]
- Writes allowed: [yes / no / only these endpoints: …] · Cleanup: [DELETE endpoint per resource | none — created records persist]
- Rate limits: [100 req/min per token (rate-limit.ts) | none found] · Idempotency: [header Idempotency-Key on POST /orders | none]
- Out of scope: [webhooks, outbound email, … — from Phase 3g, with the workaround per item]

---

## Authentication & Test Accounts

| Role | Identifier | Credential | Source | Notes |
|------|-----------|------------|--------|-------|
| user | qa.autoreg@example.com | {{user_password}} | user (pending) | standard account |
| admin | … | … | … | … |

**Token flow:** `POST /auth/login` with body `{"email": "{{user_email}}", "password": "{{user_password}}"}` → 200, token at body path `accessToken` (expires 3600 s) → send as header `Authorization: Bearer <token>`.
**Failure:** wrong credentials → 401 `{"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}}`.
**Role matrix:** admin may call everything; user may not call `/admin/*` (403, `FORBIDDEN`).

---

## API Endpoints

Every operation below was read from route registrations in source. Paths are relative to the Base URL. Path params are written `:param`.

| Method | Path | Auth | Purpose | Handler | Request model | Success | Errors |
|--------|------|------|---------|---------|---------------|---------|--------|
| POST | `/auth/login` | public | issue a token | `auth.controller.ts:24` | `LoginDto` | 200 `TokenResponse` | 400 validation · 401 invalid credentials |
| GET | `/orders` | bearer | list the caller's orders | `orders.controller.ts:31` | query `ListOrdersQuery` | 200 `Paginated<Order>` | 401 |
| POST | `/orders` | bearer | create an order | `orders.controller.ts:48` | `CreateOrderDto` | 201 `Order` | 400 validation · 401 · 409 duplicate idempotency key |
| GET | `/orders/:id` | bearer | fetch one order | `orders.controller.ts:60` | — | 200 `Order` | 401 · 404 |
| DELETE | `/orders/:id` | bearer (owner or admin) | cancel an order | `orders.controller.ts:72` | — | 204 | 401 · 403 · 404 |
[every operation — including admin-only and health endpoints]

---

## Request Models

```typescript
// EVERY request DTO / schema — verbatim
```

Validation rules (from the schemas and the error middleware):

| Model.field | Rule | Status | Error code / text (verbatim) |
|-------------|------|--------|------------------------------|
| LoginDto.email | must be an email | 400 | `VALIDATION_ERROR` · "email must be an email" |
| CreateOrderDto.items | array, minItems 1 | 400 | `VALIDATION_ERROR` · "items must contain at least 1 elements" |

---

## Response Models

```typescript
// EVERY response type / schema — verbatim, including the pagination envelope
```

Example responses (from fixtures / tests in the repo — cite the file):

```json
// GET /orders/:id → 200   (test/fixtures/order.json)
{ "id": "ord_123", "status": "pending", "items": [ { "sku": "A1", "qty": 2 } ], "total": 19.98 }
```

---

## Error Contracts

Global envelope (`http-exception.filter.ts`): `{ "error": { "code": string, "message": string, "details"?: object } }`

| Status | When | `error.code` | `error.message` (verbatim) |
|--------|------|--------------|----------------------------|
| 400 | body / query validation fails | `VALIDATION_ERROR` | first validator message |
| 401 | missing / expired / invalid token | `UNAUTHORIZED` | "Authentication required" |
| 403 | role not allowed | `FORBIDDEN` | "You do not have access to this resource" |
| 404 | record not found | `NOT_FOUND` | "Order not found" |
| 409 | conflict | `CONFLICT` | … |

---

## Endpoint Behaviors

### GET /orders — pagination
```
Params:   page (default 1), pageSize (default 20, max 100), sort (createdAt|total), order (asc|desc)
Response: { "data": Order[], "meta": { "page", "pageSize", "total" } }
Ordering: newest first by default (orders.service.ts:88)
```

### POST /orders — create, then read
```
Side effects:  creates an order for the caller; enqueues "order.created" (BullMQ) — async, no status endpoint → do NOT assert on downstream effects
Idempotency:   header Idempotency-Key; the same key twice → 409 CONFLICT
Prerequisite:  GET / DELETE /orders/:id scenarios create their order in the same scenario and capture the id
```
[one block per distinct behaviour: filtering, eventual consistency (cite the delay source), soft delete, conditional requests, …]

---

## Test Data Catalog

Every value any scenario sends or asserts. `{{key}}` tokens are resolved by AutoReg at run time from the active environment's Test Parameters.

| Key | Value | Type | Source | Used in |
|-----|-------|------|--------|---------|
| user_email | qa.autoreg@example.com | email | generated | login scenarios |
| user_password | {{user_password}} | secret | user (pending) | login scenarios |
| order_body_valid | {"items":[{"sku":"A1","qty":2}],"currency":"USD"} | json | generated (CreateOrderDto) | create-order scenarios |
| known_order_id | ord_123 | string | seed (prisma/seed.ts) | read-order scenario |
| list_page_size | 5 | number | generated | pagination scenario |
| invalid_email | not-an-email | string | generated | negative login |
| order_body_empty_items | {"items":[],"currency":"USD"} | json | generated | negative create |

---

## Invalid Variants

| Key | Endpoint | Expected status | Expected `error.code` | Expected message (verbatim) |
|-----|----------|-----------------|-----------------------|-----------------------------|
| invalid_email | POST /auth/login | 400 | VALIDATION_ERROR | "email must be an email" |
| order_body_empty_items | POST /orders | 400 | VALIDATION_ERROR | "items must contain at least 1 elements" |

---

## Known Records

[Only if the data set is fixed / seeded — cite the seed source. Omit with a note if data is live / dynamic.]

```
GET /orders (admin, no filter)     →  meta.total = 24          (prisma/seed.ts)
GET /orders?status=shipped         →  meta.total = 6
GET /orders/ord_123                →  status = "pending", items length = 1
```

---

## Open Questions

[Every assumption not confirmed by the user. Empty section = everything confirmed.]

- [ ] {{user_password}} — needed before any authenticated scenario can run
- [ ] Is the staging database seeded identically to prisma/seed.ts?

---

## Change Log

[Newest first, most recent 10 versions. MUST be a table — see the warning in Phase 7.]

| Version | Date | Mode | Commits | Features | Scenarios |
|---------|------|------|---------|----------|-----------|
| 1 | 2026-09-16 | full | 9f2b1c0 | initial: 4 features | TC-001…TC-012 |

---

## Test Scenarios

[8–30 scenarios. Rules: every Request step targets an endpoint in API Endpoints; every value is a Test Data Catalog token, a built-in ({{base_url}}, {{timestamp}}, {{uuid}}), or a runtime variable captured earlier in the SAME scenario; every scenario is self-contained (obtains its own token, creates what it reads, deletes what it created when writes are allowed); positive and negative coverage for every endpoint; negatives assert the exact status, code and message from Error Contracts / Invalid Variants.]

## Positive Scenario: TC-001 — Login returns a bearer token
- Request POST /auth/login with body {"email": "{{user_email}}", "password": "{{user_password}}"}
- Verify status is 200
- Verify response header "content-type" contains "application/json"
- Verify response body path "accessToken" is string
- Verify response body path "expiresIn" equals 3600

## Negative Scenario: TC-002 — Login with an invalid email is rejected
- Request POST /auth/login with body {"email": "{{invalid_email}}", "password": "{{user_password}}"}
- Verify status is 400
- Verify response body path "error.code" equals "VALIDATION_ERROR"
- Verify response body path "error.message" equals "email must be an email"

## Positive Scenario: TC-003 — Create, read and cancel an order
- Request POST /auth/login with body {"email": "{{user_email}}", "password": "{{user_password}}"}
- Verify status is 200
- Save response body path "accessToken" as {{auth_token}}
- Set header "Authorization" to "Bearer {{auth_token}}"
- Request POST /orders with body {{order_body_valid}}
- Verify status is 201
- Verify response body path "status" equals "pending"
- Save response body path "id" as {{order_id}}
- Request GET /orders/{{order_id}}
- Verify status is 200
- Verify response body path "items" has length 1
- Request DELETE /orders/{{order_id}}
- Verify status is 204

## Negative Scenario: TC-004 — Listing orders without a token is unauthorized
- Request GET /orders
- Verify status is 401
- Verify response body path "error.code" equals "UNAUTHORIZED"

[Continue: pagination bounds, filter with known counts, role-denied (403), not-found (404), idempotency conflict (409), one negative per validation rule (400), admin endpoints, health … until every endpoint is covered]
```

---

## Phase 7 — Self-verify before finishing (mandatory)

Run this checklist against the file you just wrote. Fix violations, then re-check:

1. Every `Request` step's `METHOD` + path matches a row in **API Endpoints** (path params normalised to `:param`; `{{tokens}}` in a path segment match a `:param`).
2. Every `{{token}}` in every step is a **Test Data Catalog** key, a built-in (`base_url`, `timestamp`, `uuid`, `now_iso`), or was captured by an earlier `Save … as` step **in the same scenario**.
3. Every scenario header matches one of the four parser formats exactly, and every step matches the step grammar in the Authoring rules.
4. Every scenario that calls an authenticated endpoint obtains its own token first (or uses a catalogued static token); nothing depends on another scenario having run.
5. Every scenario that reads, updates or deletes a record either creates it first or uses a **Known Records** id.
6. Every negative scenario asserts the EXACT status and the EXACT code / message documented in **Error Contracts** / **Invalid Variants**.
7. Every JSON in a step is valid single-line JSON with double quotes (a body that is one catalog token is written `{{key}}`).
8. Every endpoint in the table is exercised by at least one scenario, OR listed as out of scope.
9. `## Application Context` contains the line `**Spec type:** api`.
10. Open Questions lists every unconfirmed assumption.
11. No `Wait` step exists without a cited eventual-consistency source in **Endpoint Behaviors**.
12. No asserted count or exact value comes from live / dynamic data — only from **Known Records** or from the scenario's own writes.
13. **The `## Change Log` section is a TABLE, with no `- ` bullet lines anywhere inside it.** The AutoReg parser treats any `##` heading followed by bullets as a test scenario, so a bulleted Change Log is imported as a bogus test. This is not a style preference.
14. Every scenario has a coverage key, and no coverage key appears on two active scenarios (Phase 5.5).
15. The baseline you are about to write lists every feature, edge and scenario you actually produced, and every file you read carries a current hash.

---

## Phase 8 — Sign and seal (mandatory, LAST step that touches `autoreg.md`)

Every authentic `autoreg.md` carries a cryptographic signature footer issued by the AutoReg cloud. In DELTA mode, `autoreg.delta.md` must carry its own signature too. The signed report records hashes of both the complete spec and `.autoreg/delta.json`; AutoReg checks all three before it uses the machine delta. Do not edit either Markdown file after signing.

(Phase 9 runs after this one, but it only writes `.autoreg/` — it never touches the signed spec.)

Signing is part of this command. Never ask the user for separate signing permission or give them manual signing steps. In normal progress messages, show only the `signature:` field of the final summary. If signing fails, explain the actual failure because an unsigned file cannot be used in the current AutoReg workflow creation dialog.

### Primary path â€” AutoReg extension

Write the completed `autoreg.md` into the app source root and `autoreg.delta.md` into the hidden workflow on delta runs. The extension watches the source spec and hidden delta report, signs both through the AutoReg cloud, and synchronizes the signed source spec into the hidden workflow. Do not create a signing request file in the app source. Wait for both signatures, then verify that the signed source and hidden copies agree. If signing fails, report the AutoReg Signing output channel and preserve the baseline; an unsigned spec is not ready to import. Never make a direct cloud request from the coding agent while the extension is available.

### Fallback — sign via Node only outside a VS Code-family IDE

The signing API contract:
- Endpoint: `POST {base}/v1/spec/sign` where `{base}` = `$AUTOREG_CLOUD_URL` env var if set, else `https://autoreg-cloud-chat.autoregbot-ai.workers.dev`
- Headers: `Content-Type: application/json` AND `User-Agent: AutoReg-SpecSigner/1.0` — the User-Agent is REQUIRED; default script UAs (python-urllib etc.) are blocked at the network edge (HTTP 403, Cloudflare error 1010)
- Body: `{"content": "<canonical file content>", "documentType": "spec" | "delta-report"}` where canonical = the file with any existing signature footer removed, CRLF/CR normalized to LF, trailing whitespace stripped, plus exactly one trailing `\n`. Use `delta-report` for `autoreg.delta.md`.
- Success response: JSON `{alg, keyId, hash, issuedAt, signature}` — append this footer to the canonical content and write the file:

```
<!-- AUTOREG-SIGNATURE-V1
alg: {alg}
keyId: {keyId}
hash: {hash}
issuedAt: {issuedAt}
signature: {signature}
-->
```

Run this with Node (`node` is present in every environment this skill targets):

```bash
node -e '
const fs=require("fs");const path=require("path");const p=process.argv[1];
const base=(process.env.AUTOREG_CLOUD_URL||"https://autoreg-cloud-chat.autoregbot-ai.workers.dev").replace(/\/+$/,"");
const canonical=fs.readFileSync(p,"utf-8").replace(/\n*<!--[ \t]*AUTOREG-SIGNATURE-V1[\s\S]*?-->[\s\n]*$/,"").replace(/\r\n/g,"\n").replace(/\r/g,"\n").trimEnd()+"\n";
fetch(base+"/v1/spec/sign",{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"AutoReg-SpecSigner/1.0"},body:JSON.stringify({content:canonical,documentType:path.basename(p)==="autoreg.delta.md"?"delta-report":"spec"})})
.then(async r=>{if(!r.ok){console.error(`SIGNING FAILED (${r.status}): ${await r.text()}`);process.exit(r.status===422?2:1);}return r.json();})
.then(s=>{fs.writeFileSync(p,canonical+`\n<!-- AUTOREG-SIGNATURE-V1\nalg: ${s.alg}\nkeyId: ${s.keyId}\nhash: ${s.hash}\nissuedAt: ${s.issuedAt}\nsignature: ${s.signature}\n-->\n`);console.log(`signed: ${s.hash} (key ${s.keyId})`);})
.catch(e=>{console.error("SIGNING UNAVAILABLE:",e.message);process.exit(1);});' autoreg.md
```

Outside the IDE, sign `<app source root>/autoreg.md` and the hidden workflow `autoreg.delta.md`, then copy the signed source spec into the hidden workflow. The file name selects the correct document type. This command works in Bash and PowerShell. Check both footers before claiming success.

Handling outcomes (either path):
- **Success** — file now ends with the `AUTOREG-SIGNATURE-V1` footer. Do NOT edit the file after this point; any change invalidates the signature. If you must fix something, edit and re-run this phase.
- **HTTP 422** — the cloud's structural lint rejected the file. Fix the reported spec or delta report problems, re-verify, and re-sign.
- **HTTP 403 with "error code: 1010"** — the request was blocked at the network edge for missing/blocked User-Agent. Ensure the `User-Agent: AutoReg-SpecSigner/1.0` header is present exactly as shown.
- **Network failure, endpoint unavailable, or an automatic approval review blocks the request** — leave the file UNSIGNED and report that signing could not complete. An unsigned spec cannot be used in the current AutoReg workflow creation dialog. NEVER construct a signature footer yourself — a fabricated signature causes the import to be rejected as tampered. Do not ask the user for a separate signing permission prompt; if the execution environment blocks this external request, state that limitation plainly.

Then print a one-line summary:
```
autoreg.md (api) written: [N] endpoints, [N] request models, [N] response models, [N] data entries, [N] scenarios ([N] positive, [N] negative), [N] open questions, signature: [signed <keyId> | UNSIGNED]
baseline: .autoreg/baseline.json v[N] ([N] features, [N] dependency edges) — re-run this skill after changing your API and only the differences get regenerated
```
If there are open questions, list them right after the summary and ask the user to answer them now.

Then continue to Phase 9 — the run is not finished until the baseline exists.

---

## Phase 9 — Persist the baseline (mandatory, ALL modes, after signing)

The baseline is the memory that makes the next run a delta. Write it every time, in every mode. A run that produces `autoreg.md` but no baseline forces the next run to do a full re-analysis.

Layout:

```
<app source root>/
  autoreg.md                 # only visible AutoReg file; signed uploadable spec
<user home>/.local/.AutoReg/workflows/<source slug>-<source hash>/api/
  autoreg.md                 # signed copy consumed by desktop AutoReg
  autoreg.delta.md           # delta runs only; signed report
  .autoreg/
    baseline.json
    delta.json               # delta runs only
    history/
    defects/
    fixes/
  plans/
  tests/
  runs/
  <workflow>.ar
```

The source tree must not contain any other AutoReg processing files. Write the baseline atomically: archive the previous version to `.autoreg/history/`, write `baseline.json.tmp`, then rename it to `baseline.json`. Never ask the user to commit the hidden workflow. The `defects/` and `fixes/` folders belong to the feedback loop; this skill does not alter them.

### 9a. `baseline.json` schema (schemaVersion 1)

Identical to the UI skill's schema — the AutoReg app reads one format — with `specKind: "api"`, `"METHOD /path"` routes, empty `selectors`, and API-shaped feature ids.

```jsonc
{
  "schemaVersion": 1,
  "specVersion": 3,                   // increments on EVERY generation
  "generatedAt": "2026-09-16T12:00:00Z",
  "skillVersion": "1.0.0",
  "mode": "delta",                    // "full" | "delta" | "bootstrap"
  "specKind": "api",                  // this baseline was produced by generate-api-autoreg

  "specFile": "autoreg.md",
  "specHash": "sha256:…",             // canonical hash of autoreg.md (see 9b)

  "app": {
    "name": "Orders API",
    "baseUrl": "http://localhost:3000/api/v1",
    "techStack": ["NestJS 10", "Prisma", "PostgreSQL"],
    "sourceRoots": [
      { "path": "C:/apps/orders-api",
        "git": { "commit": "abc1234…", "branch": "main", "dirty": true } }
    ]
  },

  // Every file read during analysis. Key = "<rootIndex>:<path relative to that root>".
  "fileIndex": {
    "0:src/orders/orders.controller.ts": { "hash": "sha256:…", "features": ["orders"], "role": "api" },
    "0:src/orders/dto/create-order.dto.ts": { "hash": "sha256:…", "features": ["orders"], "role": "validation" },
    "0:src/common/http-exception.filter.ts": { "hash": "sha256:…", "features": ["*"], "role": "config" },
    "0:prisma/seed.ts":                    { "hash": "sha256:…", "features": ["*"], "role": "seed" }
    // role: api | route-config | validation | types | i18n | seed | config | shared | other
    // features: ["*"] marks a cross-cutting file — a change there triggers a broad VERIFY pass
  },

  "features": [
    {
      "id": "orders",                 // permanent — never renamed
      "name": "Orders",
      "description": "Create, list, read and cancel the caller's orders",
      "status": "active",             // "active" | "removed"
      "routes": ["GET /orders", "POST /orders", "GET /orders/:id", "DELETE /orders/:id"],
      "files": ["0:src/orders/orders.controller.ts", "0:src/orders/orders.service.ts", "0:src/orders/dto/create-order.dto.ts"],
      "selectors": [],
      "types": ["CreateOrderDto", "Order", "Paginated<Order>"],
      "errorTexts": ["items must contain at least 1 elements", "Order not found"],
      "dataKeys": ["order_body_valid", "order_body_empty_items", "known_order_id"],
      "dependsOn": ["auth"],
      "scenarios": ["TC-003", "TC-004", "TC-005"],
      "introducedIn": 1,
      "lastModifiedIn": 3
    }
  ],

  "dependencyEdges": [
    { "from": "orders", "to": "auth", "kind": "requires-auth",
      "evidence": "@UseGuards(JwtAuthGuard) on OrdersController" },
    { "from": "orders-admin", "to": "orders", "kind": "shares-data-entity",
      "evidence": "both read the orders table via OrdersService" }
  ],

  "scenarios": [
    {
      "id": "TC-003",
      "title": "Create, read and cancel an order",     // WITHOUT the "TC-003 — " prefix
      "kind": "positive",
      "status": "active",                              // "active" | "deprecated"
      "revision": 1,                                   // bumped on every UPDATE
      "introducedIn": 1,
      "lastModifiedIn": 1,
      "supersedes": null,
      "supersededBy": null,
      "deprecatedIn": null,
      "deprecationReason": null,
      "coverageKey": "orders/create-read-cancel/positive",
      "features": ["orders", "auth"],                  // primary first
      "selectors": [],
      "routes": ["POST /auth/login", "POST /orders", "GET /orders/:id", "DELETE /orders/:id"],
      "dataKeys": ["user_email", "user_password", "order_body_valid"],
      "errorTexts": [],
      "bodyHash": "sha256:…"                           // hash of this scenario's exact markdown block,
                                                       // from its "## … Scenario: …" header line
                                                       // through its last step bullet
    }
  ],
  "nextScenarioId": 13,                                // only ever increases

  "dataCatalog": [
    { "key": "user_email", "value": "qa.autoreg@example.com", "type": "email",
      "source": "generated", "confirmed": false },
    { "key": "user_password", "value": "{{user_password}}", "type": "secret",
      "source": "user (pending)", "confirmed": false },
    { "key": "order_body_valid", "value": "{\"items\":[{\"sku\":\"A1\",\"qty\":2}],\"currency\":\"USD\"}", "type": "json",
      "source": "generated", "confirmed": false }
  ],

  "openQuestions": [
    { "id": "q1", "text": "Is staging seeded identically to prisma/seed.ts?",
      "status": "open", "answer": null, "raisedIn": 1 }
  ],

  "changeLog": [
    { "specVersion": 3, "date": "2026-09-16", "mode": "delta",
      "commitRange": { "0": "abc1234..def5678" },
      "summary": "Added order cancellation; validation message for items changed",
      "featuresAdded": [], "featuresModified": ["orders"], "featuresRemoved": [],
      "scenariosAdded": ["TC-012"], "scenariosUpdated": ["TC-006"],
      "scenariosDeprecated": [], "scenariosUnchanged": 10 }
  ]
}
```

### 9b. Canonical hashing — use this exact script

Every hash must be computed the same way on every agent and OS, or the next run sees phantom changes. Canonical form is the file with CRLF and lone CR normalised to LF. For `autoreg.md` only, additionally strip the signature footer and `trimEnd()` plus one trailing `\n` — identical to what Phase 8's signing does, so the hash is stable across signing.

Run this to hash the source tree (Node is present in every environment this skill targets):

```bash
node -e '
const fs=require("fs"),path=require("path"),crypto=require("crypto");
const roots=process.argv.slice(1);
const skip=new Set(["node_modules","vendor","dist","build","out",".next",".nuxt",".svelte-kit",".output","target","bin","obj","coverage","__pycache__",".git",".autoreg"]);
const idx={};
function walk(root,base,prefix){for(const e of fs.readdirSync(base,{withFileTypes:true})){
 if(e.isDirectory()){if(!skip.has(e.name))walk(root,path.join(base,e.name),prefix);continue;}
 const full=path.join(base,e.name);
 const rel=prefix+":"+path.relative(root,full).split(path.sep).join("/");
 const raw=fs.readFileSync(full);
 if(raw.includes(0))continue;
 const canon=raw.toString("utf8").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
 idx[rel]="sha256:"+crypto.createHash("sha256").update(canon).digest("hex");}}
roots.forEach((r,i)=>walk(r,r,String(i)));
fs.writeFileSync(process.env.OUT||"hashes.json",JSON.stringify(idx,null,1));
console.log("hashed "+Object.keys(idx).length+" files");
' "/abs/path/to/api/src"
```

Hashing more files than you analysed is harmless — only files present in `fileIndex` take part in change detection, and new files are discovered from this same output. Write the result to a temp location, not into the project.

---

# DELTA MODE — Phases D0–D10

Run these INSTEAD of Phases 0–7 when the mode decision selected DELTA. After D9, run Phase 8 to sign both Markdown files, then Phase 9 to persist the baseline.

The shape of the work:

```
baseline (last analysis)  +  current source
        → ChangeSet        (which files changed)
        → Functional Diff  (what endpoints / contracts changed)
        → + dependencies   (what else is affected)
        → Testing Delta    (which scenarios to add / update / retire)
```

## D0 — Load the baseline and reconcile

1. Read `.autoreg/baseline.json`. If `schemaVersion` > 1, stop and tell the user to update the AutoReg extension — do NOT silently full-regenerate over a newer schema, it would discard information you cannot read. If `specKind` is `"ui"`, stop: this is a UI workflow (see the mode table).
2. Read `autoreg.md`, canonicalise it (9b), hash it, compare to `specHash`.
   - Match → proceed.
   - **Mismatch** → someone hand-edited the spec since the last run. The SPEC wins for scenario bodies: re-parse its scenario blocks, recompute each `bodyHash`, update your in-memory baseline, and tell the user which scenarios diverged. Never silently discard a hand edit.
3. Strip the signature footer from your working copy. Every comparison and the final write use unsigned canonical content; Phase 8 re-appends the footer at the end.

## D1 — Detect changes (the ChangeSet)

Hashes are ground truth. Git is an accelerator that also detects renames — it is never required, and where the two disagree, hashes win.

1. **Hash pass.** Run the 9b script over every source root. Compare to `fileIndex`:
   - `modified` — in the index, hash differs
   - `deleted` — in the index, absent from disk
   - `added` — on disk, not in the index, and matches the Phase 2 discovery rules
2. **Git pass** (only for roots that are git repos):
   - If the baseline commit is reachable: `git diff --name-status -M <baseSHA> HEAD` plus `git status --porcelain` for uncommitted work. `Rxx old new` entries are renames.
   - If it is unreachable (rebase, force-push, shallow clone): try `git merge-base <baseSHA> HEAD`. If that fails too, use the hash pass alone and say so.
3. **Merge.** Hashes decide membership; git contributes rename pairs. A rename whose canonical hash is unchanged is a **pure move**: update the paths in `fileIndex` and in the feature's `files`, and do NOT mark the feature impacted. A rename with a changed hash is a modification.

If the ChangeSet is empty: report `No functional changes since spec v<N> — nothing to do`, write nothing, do not bump the version, do not re-sign. Stop.

## D2 — Scope the re-analysis

This is where the cost saving comes from. Read ONLY:

- every added, modified, or content-changed renamed file;
- every file belonging to each **directly impacted feature** (any feature listed in `fileIndex` for a changed file) — you need the whole feature in view to re-extract it accurately;
- for added files: enough of their surroundings to place them — the router / module that mounts them, the DTOs they import;
- changed cross-cutting files (`features: ["*"]`) and what they feed: the error filter / i18n files → the exact messages scenarios assert; seed files → known ids and counts; auth middleware → every guarded endpoint.

Do not rescan the API. Everything else is trusted from the baseline — that trust is what the hashes are for.

## D3 — Build the Functional Diff

Re-run the Phase 3 extraction, scoped to D2's files, and diff the result against the baseline's feature records. Classify each touched feature as `added`, `modified`, or `removed`, and describe each change with a typed detail:

```
endpoint-added | endpoint-removed | endpoint-path-changed | endpoint-method-changed | endpoint-auth-changed
request-schema-changed | response-schema-changed | validation-changed
status-code-changed | error-text-changed | error-code-changed
behavior-changed   (pagination, ordering, idempotency, eventual consistency)
flow-changed | seed-data-changed | role-added | role-removed
```

Record `before` and `after` for anything renamed, re-pathed or reworded — the delta cannot be applied mechanically without both halves.

New features get a new permanent `id` (check it against every id ever used, including `status: "removed"` ones). Extend `dependencyEdges` for what you found: a new endpoint behind a guard gets a `requires-auth` edge, a new endpoint that needs a created record gets `flow-prerequisite`, and so on.

## D4 — Propagate impact

1. **REVIEW** — every feature named in the Functional Diff.
2. **VERIFY, one hop** — every feature with an edge pointing at a REVIEW feature:
   - `flow-prerequisite`, `uses-type`, `shares-data-entity`, `navigates-to` → always propagate.
   - `requires-auth` → propagate **only if the auth feature itself is in REVIEW**. Otherwise every change in the API would appear to touch every authenticated endpoint.
3. **VERIFY, second hop** — only across `flow-prerequisite` edges (create → read → delete). Stop there.
4. **Cross-cutting files.** When a `features: ["*"]` file changed, find the scenarios that actually depend on it rather than flagging everything:
   - error filter / i18n → match changed strings against scenarios' `errorTexts`
   - seed / fixture → features owning Known Records assertions
   - shared DTO / schema → features whose `types` include it
   - auth middleware → every scenario whose routes require auth (this is the one case where a broad VERIFY is right)

If more than 60% of active features end up impacted, this is not a delta. Say so and recommend `--full`; non-interactively, run FULL and note it in the summary.

## D5 — Classify every scenario (the Testing Delta)

Give each **active** scenario exactly one classification.

| Class | When | What to do |
|---|---|---|
| **UNCHANGED** | none of its features are in REVIEW or VERIFY, and none of its routes, error texts, statuses or data keys appear in the Functional Diff | copy its block through byte-for-byte; verify its `bodyHash` still matches |
| **VERIFY** | its feature is VERIFY-impacted | re-check every path, method, status, exact text and body field it uses against current source. All still hold → treat as UNCHANGED. Anything broken → UPDATE |
| **UPDATE** | its feature is in REVIEW and the diff touches something it uses, but the intent still makes sense | rewrite the body, **keep the TC id**, bump `revision`, set `lastModifiedIn` |
| **REPLACE** | the intent itself is gone (login moved to OAuth client-credentials, so "wrong password" means nothing) | deprecate the old one with `supersededBy`, author a new scenario with a fresh id, `supersedes` the old, new coverage key |
| **DEPRECATE** | its feature is `removed`, or its specific endpoint was removed | set `status: "deprecated"`, record `deprecatedIn` and a reason |

**Choosing between them** — the distinction that matters most:

- Path renamed, error text reworded, status code changed, a body field renamed → **UPDATE**. Mechanical substitution; keep the steps' shape.
- Validation tightened, a required header added, an auth step now needed → **UPDATE**, restructuring steps.
- The endpoint no longer exists in that form → **REPLACE**.
- The feature is gone → **DEPRECATE**.
- Nothing in the diff touches it → **UNCHANGED**, and leave it alone. Do not "improve" untouched scenarios in delta mode even if you can see how. That is what `--full` is for, and silently rewriting a passing test is worse than leaving an imperfect one.

Then enumerate what is **NEW**. For each `added` or `modified` feature, list the coverage keys the change demands: the happy path, one negative per new validation rule (asserting its exact status and message), an unauthorized (401) case and a role-denied (403) case if it is auth-gated, a not-found (404) case if it takes an id. Then author a scenario **only for keys that have no active scenario**. That check is the entire duplicate-prevention mechanism — do not skip it because a title looks different.

Keep the spec's 8–30 scenario range in mind as a soft ceiling; prefer merging near-identical intents over exceeding it.

## D6 — Ask the user (delta-scoped only)

Batch into ONE message, and ask only what the delta raises: sample payloads for NEW request models, credentials for NEW roles, write permission for NEW mutating endpoints, seed expectations for NEW list endpoints.

Never re-ask anything already answered: skip every `openQuestions` entry with `status: "answered"` and every `dataCatalog` row with `confirmed: true`. Re-asking a question the user already answered is the fastest way to make this feature feel broken.

Non-interactive: proceed with generated values, add new Open Questions entries, prefer read-only scenarios for new mutating endpoints.

## D7 — Author the delta scenarios

Write bodies for NEW, UPDATE and REPLACE only, under the same authoring rules as full mode: the parser contract and step grammar, only catalogued endpoints, only catalogued values or same-scenario runtime variables, each scenario self-contained with its own token and its own records. Append any new values to the Test Data Catalog and any new failing values to Invalid Variants.

## D8 — Merge and write the outputs

### `autoreg.md` — surgical update, section order unchanged

- **Application Context** — refresh `Generated` and `Source commit`; add `**Spec version:** <N> (delta)`. Keep `**Spec type:** api`.
- **API Endpoints, Request Models, Response Models, Error Contracts, Endpoint Behaviors, Known Records** — apply only the Functional Diff. Add, update and remove the affected rows and blocks; leave every other line byte-identical.
- **Authentication & Test Accounts** — only if auth or roles changed.
- **Test Data Catalog / Invalid Variants** — append new rows. Never delete a user-provided row; if its scenarios were deprecated, note `unused` instead.
- **Open Questions** — append new ones, remove answered ones.
- **Change Log** — prepend this version's row. **Table, never bullets** (Phase 7 check 13).
- **Test Scenarios** — UNCHANGED blocks byte-identical; UPDATE and REPLACE swapped in place; NEW appended at the end; DEPRECATED **removed entirely** — the AutoReg app must never import a dead scenario. They survive in the delta report, the Change Log and the baseline.

### `autoreg.delta.md` — the delta-only report

Only new and changed material, with references rather than copies for everything unchanged:

```markdown
# [API Name] — AutoReg API Delta Report — spec v3

**Base:** spec v2 (2026-08-14, commit `abc1234`) → **Target:** commit `def5678` (2026-09-16)
**Complete spec:** `autoreg.md` — import that, not this file.
**Complete spec SHA-256:** `sha256:<canonical autoreg.md hash>`
**Machine delta SHA-256:** `sha256:<hash of exact .autoreg/delta.json bytes>`

## Change Summary
- Features: 1 added (order-cancellation) · 1 modified (orders) · 0 removed
- Scenarios: 2 new · 1 updated · 0 deprecated · 10 unchanged

## Functional Diff
### order-cancellation — added
[endpoints, what they do, evidence files]
### orders — modified
- Validation message: "items must contain at least 1 elements" → "items must not be empty" (create-order.dto.ts)
- Status code: POST /orders now returns 202 (orders.controller.ts:48)

## Downstream Impact
| Feature | Via | Result |
|---|---|---|
| orders-admin | shares-data-entity ← orders | verified — no scenario changes needed |

## New Scenarios
[full scenario blocks — same parser contract as autoreg.md]

## Updated Scenarios
### TC-006 (rev 2) — validation message changed
[full replacement block]

## Deprecated Scenarios
| ID | Title | Reason | Superseded by |
|---|---|---|---|

## Unchanged Scenarios (references — see autoreg.md)
| ID | Title | Feature |
|---|---|---|
| TC-001 | Login returns a bearer token | auth |
```

### `.autoreg/delta.json` — the machine contract

The AutoReg app reads THIS, not the markdown report — it drives deletions, and parsing prose to decide what to delete is not acceptable. Write it in the same run:

```jsonc
{
  "schemaVersion": 1,
  "fromSpecVersion": 2,
  "toSpecVersion": 3,
  "specHash": "sha256:…",          // canonical hash of the autoreg.md you just wrote
  "operations": [
    { "op": "add", "tcId": "TC-013",
      "coverageKey": "order-cancellation/cancel/positive",
      "title": "Cancel a pending order", "category": "positive",
      "description": "…", "bodyHash": "sha256:…",
      "reason": "feature order-cancellation added" },

    { "op": "update", "tcId": "TC-006",
      "coverageKey": "orders/create/negative/empty-items",
      "reason": "validation message changed", "bodyHash": "sha256:…",
      "changedAspects": ["assertion-text"],
      "patch": { "substitutions": [
        { "field": "expected",
          "from": "items must contain at least 1 elements",
          "to": "items must not be empty" }
      ] } },

    { "op": "update", "tcId": "TC-003",
      "coverageKey": "orders/create-read-cancel/positive",
      "reason": "orders moved under /v2", "bodyHash": "sha256:…",
      "changedAspects": ["url"],
      "patch": { "substitutions": [
        { "field": "path", "from": "/orders", "to": "/v2/orders" }
      ] } },

    { "op": "deprecate", "tcId": "TC-007",
      "coverageKey": "orders/legacy-export/positive",
      "reason": "endpoint removed in v3" },

    { "op": "unchanged", "tcId": "TC-001",
      "coverageKey": "auth/login/positive" }
  ]
}
```

Mapping D5 classifications to operations — there are only four `op` values:
- UNCHANGED → `unchanged`
- UPDATE → `update`
- DEPRECATE → `deprecate`
- REPLACE → **two operations**: a `deprecate` for the old scenario and an `add` for its successor. There is no `replace` op.
- NEW → `add`, carrying `title`, `category`, `description` and `bodyHash` so the app knows what to generate.

`changedAspects` decides how much work the app has to do, so be accurate:
- `assertion-text` (an expected status, code or message), `url` (a request path), `value` (a body / query / header value) → applied mechanically, no LLM. Requires a `patch.substitutions` entry giving exact `from` and `to`, with `field` one of `expected`, `path`, `value`, `header`, `url`.
- `flow`, `steps`, or anything else (a new auth step, a new required header, a changed body shape) → the app regenerates the scenario.

Only claim a mechanical aspect when the substitution is genuinely exact and complete. The app verifies that each substitution actually matched something; one that matches nothing is reported as drift, not applied.

After writing the final `.autoreg/delta.json`, compute its SHA-256 over the exact UTF-8 file bytes. Compute the complete spec hash with Phase 8's canonicalization (signature removed, LF line endings, one trailing newline). Put both lowercase `sha256:<64 hex>` values in the report above. Do this before D9 verification and before signing; do not rewrite the JSON or either Markdown file after signing.

## D9 — Delta self-verification (mandatory)

Run the whole Phase 7 checklist against the merged `autoreg.md`, then these:

1. Every UNCHANGED scenario block is byte-identical to the previous spec (compare to its recorded `bodyHash`).
2. Exactly one active scenario per coverage key. No TC id appears twice. Every id is below `nextScenarioId`.
3. Every path, method, status and exact text used by NEW and UPDATED scenarios was confirmed against current source **in this run** — cite the file.
4. No active scenario references anything the Functional Diff removed.
5. No deprecated scenario remains in `## Test Scenarios`.
6. `autoreg.delta.md`, `.autoreg/delta.json` and `autoreg.md` agree: every operation in the JSON matches the report, every non-`unchanged` operation corresponds to a real change in the spec, and every `unchanged` reference names a real active TC id. The report's two SHA-256 lines match the final spec and the exact machine JSON bytes.
7. Every `patch.substitutions` entry quotes text that actually appears in the previous version of that scenario.
8. `fileIndex` covers every file read this run with a current hash, and every active feature's files exist on disk.
9. The Change Log row for this version matches what you actually did.

## D10 — Sign and persist

Run **Phase 8** (signing) on both `autoreg.md` and `autoreg.delta.md`, then **Phase 9** (baseline). Compute `delta.json`'s `specHash` from the same canonical spec content — it is signature-invariant, so it holds before and after signing. Do not tell the user to apply the delta unless both signatures succeeded.

Print the summary:

```
autoreg.md (api) updated (delta v3): +2 scenarios (TC-013, TC-014), ~1 updated (TC-006), -1 deprecated (TC-007), 10 unchanged; 1 feature added, 1 modified; 2 open questions; signature: signed <keyId>
delta report: autoreg.delta.md · machine delta: .autoreg/delta.json
Apply it in AutoReg: ask the agent to "apply the spec delta" — it previews the changes before touching any test.
```

---

# BOOTSTRAP MODE — Phase B

For an API that already has an `autoreg.md` written by this skill but no baseline: adopt the existing spec as baseline v1 without regenerating it.

**The rule that matters: do not rewrite scenario bodies.** The whole point is to adopt working coverage untouched. The only permitted edit is assigning TC ids to scenarios that lack them.

1. **Confirm the spec kind.** The existing source `autoreg.md` must contain `**Spec type:** api` or an `## API Endpoints` section. If it is a UI spec (it has `## Confirmed UI Selectors`), stop: the API spec belongs in its own API source subfolder and private API workflow.
2. **Parse the existing `autoreg.md`** (canonical form): scenario blocks with their ids, titles, kinds and steps; the API Endpoints table; Request / Response Models; Error Contracts; Test Data Catalog; Open Questions. From each scenario's steps extract the methods, paths, statuses, quoted values and asserted texts it uses — that is what links it to features.
3. **Assign missing TC ids** in file order (`TC-001`, `TC-002`, …). This is the one allowed spec edit; re-sign afterwards via Phase 8.
4. **Light source scan.** Run Phase 2 discovery and the 9b hasher to build `fileIndex`. Do not redo the full Phase 3 extraction where the spec already states the fact — you are adopting it, not auditing it. Infer features by grouping endpoints by resource, map each scenario to features via its routes, derive coverage keys, and extract dependency edges from guards, shared DTOs and flow ordering.
5. **Consistency check.** Verify each scenario's endpoints still exist in current source with the same method and auth. Mismatches mean the API drifted after the spec was written: report them and mark those scenarios stale — they will surface as UPDATEs in the delta that follows. Do not fix them here.
6. **Write baseline v1** with `mode: "bootstrap"`, `specKind: "api"`, `specHash` of the current spec, a `bodyHash` per scenario, and `nextScenarioId` = highest id + 1.
7. **Continue straight into DELTA (D1 onward)** in the same run. If the API has not changed since the spec was written, D1 finds nothing and bootstrap was the whole run — which is the correct outcome.

---

## Authoring rules (parser contract — enforce strictly)

1. **Scenario headers** — use EXACTLY one of these formats (`##` or `###`):
   ```
   ## Positive Scenario: Title text
   ## Negative Scenario: Title text
   ## Scenario (positive): Title text
   ## Scenario (negative): Title text
   ```
   Include a stable ID in the title (`TC-001 — …`) so scenarios can be tracked across regenerations.

2. **Steps are plain `- ` bullets** using ONLY the forms in the step grammar below. The AutoReg agent parses these forms deterministically; anything else is rejected at import.

3. **Step grammar:**

   | Step form | Notes |
   |-----------|-------|
   | `- Request <METHOD> <path> [with headers <json>] [with query <json>] [with body <json>]` | METHOD uppercase (`GET POST PUT PATCH DELETE HEAD OPTIONS`). `<path>` starts with `/` (relative to the Base URL) or is a full URL. Each `<json>` is valid single-line JSON with double quotes; a body that is exactly one catalog key is written `{{key}}` (typed `json` in the catalog). The `with` clauses may appear in any order. |
   | `- Set header "<name>" to "<value>"` | Applies to every later request in the same scenario. |
   | `- Verify status is <code>` · `- Verify status is one of <c1>, <c2>` | |
   | `- Verify response header "<name>" exists` · `equals "<value>"` · `contains "<value>"` | Header names compare case-insensitively. |
   | `- Verify response body path "<path>" <predicate>` | Predicates: `exists` · `does not exist` · `equals <value>` · `contains "<text>"` · `matches "<regex>"` · `is <string|number|boolean|object|array|null>` · `has length <n>` · `has at least <n> items` · `is at least <n>` · `is at most <n>`. `<value>` is a JSON literal (`"text"`, `42`, `true`, `null`) or a `{{token}}`. |
   | `- Verify response body equals <json>` | Whole-body deep equality — only for tiny, fully known responses. |
   | `- Save response body path "<path>" as {{name}}` · `- Save response header "<name>" as {{name}}` | Captures a runtime variable usable in later steps of the SAME scenario. |
   | `- Wait <n> ms` | Only when Endpoint Behaviors documents eventual consistency — name the source in the step, e.g. `- Wait 500 ms (orders are indexed asynchronously — search.service.ts)`. |

   Body path syntax: dot and bracket only — `data.items[0].id`, `[2].name`, `meta.total`. No filters, no wildcards. `{{tokens}}` may appear inside paths, headers, query, body and expected values.

4. **Every request targets a catalogued endpoint** — the method and path (params normalised) must appear in `## API Endpoints`.

5. **Every value is a token or a runtime variable** — request bodies, query values, header values, path ids and asserted test data all come from the Test Data Catalog (`{{key}}`), the built-ins (`{{base_url}}`, `{{timestamp}}`, `{{uuid}}`, `{{now_iso}}`), or a `Save … as {{name}}` earlier in the same scenario. Fixed API copy (an error code, a status string the API always returns) is written literally.

6. **Self-contained scenarios** — each scenario obtains its own token, creates the records it reads or deletes (or uses a Known Records id), and cleans up what it created when writes are allowed. Never rely on another scenario having run.

7. **Every model verbatim** — never summarise or paraphrase request / response definitions.

8. **Exact text everywhere** — error codes and messages: copy the string the API actually returns (resolve i18n keys through the locale files), never approximate.

9. **Determinism** — no assertions on timing, on counts of live data, or on values that depend on wall-clock time unless a Known Records row backs them. Prefer `has at least 1 items` over an exact count you cannot cite.

10. **Signature footer is sacred** — the `<!-- AUTOREG-SIGNATURE-V1 … -->` block must be the last thing in the file, added only by Phase 8's signing endpoint. Never write, copy, or modify one by hand, and never edit the file after signing (re-sign instead).
