Generate a complete, production-grade `autoreg.md` specification for **UI / end-to-end testing** of an AutoReg project. This file is the single source of truth the AutoReg agent uses to generate browser-driven end-to-end tests that pass on the first run — so it must contain only facts extracted from live source code, plus test data that is either confirmed by the user or deterministically generated.

This skill is normally dispatched by the `generate-autoreg` router (which decides whether a project is a UI, an API or both); it can also be run directly. Its sibling `generate-api-autoreg` produces the API-testing spec — never mix the two into one file.

Every fact in the file must come from live source code read during THIS run — never copy analysis forward from an existing `autoreg.md` on trust. What DOES carry forward, in every mode, is user input: values in `## Test Data Catalog` marked `Source: user` and answered `## Open Questions` are the user's, not stale analysis. Never re-ask what they already answered.

---

## Mode decision — do this after resolving the paths below, BEFORE source analysis

This skill runs in one of three modes. Pick one by looking at what is already on disk in the project folder, then follow only that mode's phases.

| On disk | Flag given | Mode | What to run |
|---|---|---|---|
| No `autoreg.md`, no `.autoreg/baseline.json` | any | **FULL** | Phases 0–8 (this is the original behaviour) |
| `autoreg.md` exists, but NO `.autoreg/baseline.json` | none | **BOOTSTRAP** → then DELTA | Phase B (adopt the existing spec), then D0–D10 |
| Both exist, baseline valid | none or `--delta` | **DELTA** | Phases D0–D10 |
| Both exist | `--full` | **FULL** | Phases 0–8, but preserve scenario IDs by coverage key (see Phase 5.5) |
| Baseline corrupt, unreadable, or `schemaVersion` newer than 1 | any | **FULL** | Say why in one line. Salvage `dataCatalog` + `openQuestions` from it first if the JSON parses at all |
| DELTA finds more than 60% of features impacted | — | **recommend FULL** | Ask the user; non-interactively just run FULL and say so in the summary |

Announce the chosen mode in one line before you start work, e.g. `Mode: delta (baseline v2 → v3)`.

**Never** regenerate every scenario when the baseline is usable. Rewriting scenarios that nothing in the app touched is how stable, working tests get silently broken.

---

## Inputs from $ARGUMENTS

Parse `$ARGUMENTS` as paths and flags, respecting quotes around paths with spaces:
- Any token starting with `--`: a **mode flag**. Recognised: `--full`, `--delta`, `--bootstrap`. Strip flags out before reading the paths below — they may appear in any position. Unknown `--flags` are ignored with a one-line note.
- Token 1 (file path): **project folder** — the AutoReg project directory that contains the `.ar` manifest and where `autoreg.md` will be written
- Token 2+ (file paths): **app source directories** — one or more roots of the application under test. Multiple tokens = multi-repo app (e.g. separate frontend and backend repos). Scan ALL of them.

**Path resolution is mandatory before choosing a mode or reading application source.** The `generate-autoreg` router normally completes this check and passes both roles explicitly. If this skill is called directly with no paths, ask in one message whether the absolute current directory is the **app source** and for the absolute **AutoReg workflow folder** (the folder with the `.ar` file and `tests/`, or the intended new workflow folder). Do not continue until the user has explicitly identified both roles. If only the workflow path is supplied, show the source roots recorded in its `.autoreg/baseline.json` as suggestions (or the current directory when no baseline exists) and ask the user to confirm or replace them. Never silently treat the current directory as the workflow or silently reuse baseline source paths.

State the resolved absolute workflow path and every app source path before proceeding. If they are the same path or conflict with an existing baseline's `app.sourceRoots[].path`, resolve that ambiguity with the user first. Check that all app source roots exist; if one moved, ask for its new path rather than silently analysing a subset. A new workflow folder is allowed; an existing one must match the intended `.ar` file or `autoreg.md`. If user input is unavailable, stop and request an invocation with both paths. Do not repeat this question when the router has already passed both confirmed paths.

---

## Phase 0 — Clarify with the user (ALWAYS do this first)

Before deep analysis, do a quick 2-minute scan of the app (routes, auth, forms) and then ASK the user the questions below. Batch them into ONE message — do not drip-feed. Only ask questions the scan could not answer.

1. **Environment** — "Is the app running at `[url from .ar manifest]`? Which environment should tests target (local / staging)?"
2. **Test accounts** — If the app has authentication: "Provide test credentials for each role you want covered (e.g. admin, regular user). Or should I use a register-fresh-user flow instead?" NEVER invent credentials for an app with a real backend.
3. **Seed / fixture data** — If the app renders lists, search results, or dashboards: "Is the data set fixed (seeded)? Can you share known records — e.g. search terms and how many results they return, product names, order IDs?"
4. **Destructive actions** — "May tests perform writes (create/update/delete records, place orders, send emails)? Anything that must NOT be touched?"
5. **Sample test data** — For any domain-specific form found (payment, address, SSN, license keys, file uploads): "Provide valid sample values, or should I generate synthetic ones?"

Handling the answers:
- Record every user-provided value in the `## Test Data Catalog` section with `Source: user`.
- If the user says "generate it", produce realistic synthetic values (`Source: generated`) — see Phase 4.
- If running non-interactively (no user available, e.g. CI), do NOT block: proceed with generated data, mark every unconfirmed assumption in the `## Open Questions` section, and prefer read-only scenarios over destructive ones.

---

## Phase 1 — Read the project manifest

Search the project folder for a file ending in `.ar` (e.g. `myapp.ar`). Read it as JSON and extract:
- `sources[0].url` — base URL of the application under test
- `sources[0].name` — display name
- `sources[0].autoregMd` — relative path where `autoreg.md` lives (default: `"autoreg.md"`)
- `metadata.name` — project name

If no `.ar` file exists, use the project folder name as the project name and `autoreg.md` as the output path.

---

## Phase 2 — Detect the tech stack, then discover source files

First read `package.json` / `composer.json` / `Gemfile` / `requirements.txt` / `pyproject.toml` / `pom.xml` / `build.gradle` / `*.csproj` / `go.mod` to identify the framework. Then scan the matching file set (search recursively; skip `node_modules/`, `vendor/`, `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `.svelte-kit/`, `.output/`, `target/`, `bin/`, `obj/`, `coverage/`, `__pycache__/`, `.git/`):

| Stack | UI / template files | Route sources |
|-------|--------------------|---------------|
| React / Preact / Solid | `**/*.tsx`, `**/*.jsx` | React Router config, TanStack Router, `routes.tsx` |
| Next.js | `app/**/page.tsx`, `pages/**/*.tsx` | file-system routes (`[param]` → `:param`) |
| Remix / React Router v7 | `app/routes/**` | file-system routes |
| Vue / Nuxt | `**/*.vue` | `router/*.{ts,js}`, Nuxt `pages/**` |
| Angular | `**/*.component.html`, `**/*.component.ts` | `*-routing.module.ts`, `app.routes.ts` |
| Svelte / SvelteKit | `**/*.svelte` | `src/routes/**` |
| Astro | `**/*.astro` | `src/pages/**` |
| Plain HTML / jQuery | `**/*.html` | anchor hrefs, server config |
| Rails | `app/views/**/*.erb`, `*.haml`, `*.slim` | `config/routes.rb` |
| Django / Flask | `templates/**/*.html` (Jinja) | `urls.py`, `@app.route` decorators |
| Laravel / PHP | `resources/views/**/*.blade.php`, `**/*.php` | `routes/web.php`, `routes/api.php` |
| Spring | `src/main/resources/templates/**` (Thymeleaf/JSP) | `@GetMapping` / `@PostMapping` controllers |
| ASP.NET | `**/*.cshtml`, `**/*.razor` | attribute routes, `Program.cs` maps |
| Express / Fastify / NestJS / Hono / Go / etc. | — | route registrations, controllers |

Also always read: `**/*.ts`, `**/*.js` (types, hooks, API clients), `**/*.css`, `**/*.scss`, `tailwind.config.*`, i18n resource files (`locales/**/*.json`), seed/fixture files (`seeds/`, `fixtures/`, `db/seeds*`, `prisma/seed*`, `*.sql` inserts), and `.env.example` (never `.env`).

**Monorepo:** if the source root contains `apps/` / `packages/` workspaces, identify which package is the web app under test (matches the `.ar` base URL) and scan it plus any shared UI packages it imports.

---

## Phase 3 — Extract every technical detail

Read each discovered file and catalogue the following.

### 3a. Element selectors — with reliability tiers

For every interactive or identifiable element record a selector, its source file, and its tier. When multiple selectors exist for one element, list them best-tier first.

**Tier 1 — test hooks (always prefer):** `data-testid`, `data-test`, `data-cy`, `data-qa` → `[data-testid=value]`
**Tier 2 — stable ids:** hand-written `id="value"` → `#value` (skip framework-generated ids — see forbidden list)
**Tier 3 — form semantics:** `input[name=email]`, `input[type=password]`, `button[type=submit]`, `select[name=country]`
**Tier 4 — accessibility:** `[aria-label=Search]`, `[role=dialog]`, `[placeholder*=email i]`
**Tier 5 — structure & links:** `a[href="/cart"]`, `nav`, `form`, `table`
**Tier 6 — visible text:** `text=Sign in` (record the EXACT rendered text; check i18n files for the actual string if the template uses translation keys like `t('login.submit')`)
**Tier 7 — plain CSS classes:** `.product-card` — ONLY if the class is hand-written and appears verbatim in the DOM.

**FORBIDDEN selectors — never record or use these:**
- CSS-module class names (`styles.card` from `*.module.css` — hashed at build time, e.g. `.card_x7f3a`)
- styled-components / Emotion generated classes (`sc-*`, `css-*` hashes)
- Framework-generated ids: React `:r0:`/`:r1:`, MUI `mui-*`, Ember `ember-*`, auto-increment ids
- Long Tailwind utility chains as identity (`.flex.items-center.gap-2` — allowed only as a last-resort state check, never as element identity)
- Positional selectors (`div > div:nth-child(3)`) — break on any layout change

Group selectors by the component/page file they came from. Note the HTML element type (input, button, a, form, select…) for each.

### 3b. CSS class names (from stylesheets)

Read every `.css`, `.scss`, `.less` file. Extract defined class selectors and group by concern: layout containers, loading/spinner/skeleton states, error/validation states, success/toast states, active/selected states, hidden/visible toggles, card/list-item wrappers. For `*.module.css` files, record the class under its FILE so behaviour is understood, but mark it `(CSS module — hashed, do not use as selector; use its parent's data-testid/structure instead)`.

### 3c. Domain types and models

Extract every type that determines what the UI renders or what forms accept:
- TypeScript: `interface`, `type`, `enum` — copy verbatim
- Zod / Yup / Joi / class-validator schemas — these ALSO define validation rules (min length, regex, required) → feed them into negative scenarios and generated test data
- Backend models when available (Prisma schema, Django models, Rails schema.rb, JPA entities, SQLAlchemy) — copy the relevant entities

### 3d. Routes and pages

Capture every route: path, HTTP method (for API routes), component/handler file, purpose, and **auth requirement** (public / authenticated / role-restricted — look for middleware, guards, `requireAuth`, `@login_required`, `[Authorize]`, layout-level redirects). Note dynamic params (`/products/:id`) and whether routing is history-based or hash-based (`/#/route`).

**Content-collection frameworks — never assume filename === URL id.** For any dynamic route backed by a content-collection loader (Astro `getEntry`/`getCollection` with `glob()` or `file()`, Next.js `generateStaticParams` over a content directory, and equivalents), the URL id is whatever the FRAMEWORK'S LOADER computes — which is frequently NOT just the filename, even when the content type's own schema (Zod/TypeScript) declares no such field. Frameworks commonly reserve a frontmatter/config key that silently overrides the generated id regardless of the app's schema (e.g. Astro's `glob()` loader special-cases a `slug` frontmatter field — see its `loaders/glob.js` source: `if (data.slug) return data.slug` — completely independent of whatever the collection's Zod schema declares). Before asserting "the id is the filename": (1) read the ENTIRE frontmatter/data block of every sample content file top to bottom, not just the first screen of it — an override key can appear anywhere in the file; (2) check the loader's own source or official docs for reserved override keys, don't infer purely from the app's schema; (3) if genuinely unsure, say so in Open Questions rather than asserting a guessed URL as fact — a wrong URL 404s and cascades into every scenario that depends on it.

### 3e. Loading and transition patterns

Find every pattern where an async operation renders a DOM change:
- `{isLoading && <Spinner/>}` → which selector appears? which disappears? what renders when done?
- Suspense fallbacks, skeleton components, `aria-busy=true`, disabled-while-pending submit buttons, route-level loaders
- Optimistic updates (DOM changes BEFORE the network completes — assert immediately, no loading wait)

Document per pattern: **trigger → loading selector appears → loading selector disappears → final state selector**.

### 3f. Error, validation and success surfaces

- Inline field errors: which selector renders, and the EXACT error text (from the validation schema, i18n file, or literal string — copy it verbatim, tests assert on it)
- Form-level / API errors: banner or toast selector + text
- Toast/snackbar system: container selector, auto-dismiss timing if configured
- Success paths: redirect target, success message selector + text
- Native HTML5 validation (`required`, `pattern`, `type=email` without JS) — the browser blocks submit and no DOM error element appears; scenarios must assert "still on same URL / no navigation" instead of an error selector

### 3g. Network vs client-side interactions

Classify every interaction:
- **Network (async):** `fetch`, `axios`, `useMutation`/`useQuery`, form action/loader, `$.ajax` → loading indicator appears; scenario needs wait-for-loading steps
- **Client-side instant:** array filter/sort, state toggles, accordion/tab switches, CSS class swaps → NO loading; assert immediately
- **Debounced:** search-as-you-type with debounce (note the ms) → scenario should type then wait for the loading indicator, not assert instantly

### 3h. Authentication and session

Document how tests reach protected pages:
- Login form: URL, field selectors, submit selector, post-login redirect, error selector + exact text for bad credentials
- Registration flow if it exists (enables fresh-user pattern: unique email like `autoreg+<timestamp>@example.com`)
- Session persistence (cookie/localStorage) and logout: trigger selector, post-logout state
- Role matrix if multiple roles exist: role → what it can see/do → which test account covers it

### 3i. Third-party and non-automatable surfaces

Flag anything browser automation cannot drive deterministically so scenarios avoid or bound it: OAuth/SSO redirects to external providers, CAPTCHA, payment iframes (Stripe/PayPal), email-verification steps, file pickers, WebGL/canvas apps, browser dialogs (`alert`/`confirm`). For each, state the workaround (test account that skips it, seeded session, or "out of scope").

### 3j. Bounded/stateful widgets — trace exact interaction counts, never assume them

This applies to ANY widget whose state moves through a bounded sequence via repeated interaction — steppers/wizards, carousels, forced-order accordions, and just as much to quantity/serving incrementers-decrementers, repeated-click paginators, or any control with a floor/ceiling: read the component's actual state logic — the initial value, the min/max or first/last bound, and the exact condition under which controls disable, hide, or a terminal state ("Finish", "Add to cart", floor reached) appears — and derive the number of interactions needed to reach any given state by TRACING the code, including its default config (a bound is often a library default the component never overrides, e.g. a numeric stepper's `min` defaulting to 0 with no `data-*` override in sight). Never compute it by arithmetic assumption:
- "3 nav items → 3 Next clicks" is wrong — a widget with 3 panels reached by clicking "Next" from panel 1 needs exactly 2 clicks; "Finish" is a state of the last panel, not an extra step past it.
- "start at 1, decrement repeatedly" is wrong without checking the floor — if the control starts at 1 and its min is 0 (check the library/plugin default if the markup sets no explicit min), exactly ONE decrement reaches the floor and the button disables; a scenario authoring a second decrement click times out waiting for a disabled button.

Cite the specific conditional and starting/bound values you traced (e.g. "Finish button visible when `currentStep === steps.length - 1`"; "input starts at 1, plugin default `min: 0` — one decrement reaches floor") next to the widget in Confirmed UI Selectors or Known Element Counts.

---

## Phase 4 — Build the Test Data Catalog

Every value that any scenario fills into a form MUST come from this catalog. Three sources:

1. **`user`** — values the user provided in Phase 0 (credentials, known records, domain samples). Use them verbatim.
2. **`generated`** — synthetic values you create. Make them realistic AND validation-schema-compliant (respect min/max length, regex, allowed enums found in 3c). Conventions:
   - Emails: `qa.autoreg@example.com`; unique-per-run: `autoreg+<timestamp>@example.com`
   - Names/addresses/phones: realistic fake values (never real people); phone formats matching the validation regex
   - Payment cards: standard test numbers only (e.g. `4242 4242 4242 4242`, any future expiry, any CVC) and ONLY against test-mode gateways
   - Invalid variants: for every field with validation, also produce a failing value + the exact expected error text
3. **`seed`** — values read from the app's own seed/fixture files (known products, users, counts). Cite the seed file.

**Placeholders:** if a value is secret or environment-specific and the user did not provide it, write the token `{{key}}` in scenario steps and add a catalog row with `Source: user (pending)`. The AutoReg agent resolves `{{key}}` at import time — this is the supported hand-off for managed test data. Never invent real-looking secrets, and never copy values from `.env`.

---

## Phase 5 — Synthesise before writing

Build these maps before generating the file:

1. **Pages inventory** — every route, URL, purpose, auth requirement, key component file
2. **Selector catalogue** — grouped by page, tier-ordered, each with element type + source file
3. **Domain types** — verbatim definitions + validation rules
4. **Interaction map** — per page: user actions, network vs instant, loading/error/success selectors
5. **Test data catalog** — complete; every form field on every page has at least one valid and one invalid value
6. **Flow graph** — login, register, CRUD, search, filter, sort, checkout, logout, error paths; note ordering dependencies (e.g. "item must exist before it can be deleted") and make each scenario self-contained anyway
7. **Invalid selectors** — generic names an LLM might guess that don't exist in THIS codebase

---

## Phase 5.5 — Build the baseline model (FULL and BOOTSTRAP modes)

Everything above is thrown away at the end of the run unless you persist it. The baseline is what makes the NEXT run a cheap delta instead of another full regeneration, so build it now, while the analysis is fresh, and write it in Phase 8.

Decompose the app into **features** — one user-facing capability each (login, product search, checkout, wishlist). Aim for a granularity where a feature maps to 1–6 scenarios and 1–10 files; if a feature owns 20 files it is really several features.

Give every feature a stable kebab-case `id` (`auth-login`, `product-search`). **Feature ids are permanent** — once assigned, never rename one, even if the feature is renamed in the UI. Renaming breaks the link to its scenarios.

For each feature record: `routes`, `files`, `selectors`, `types`, `errorTexts` (the exact strings its scenarios assert), `dataKeys`, and `dependsOn`.

Then record **dependency edges** — directed, `from` depends on `to`, each with a one-line `evidence` string naming the file or guard you read it from. Edge kinds:
- `requires-auth` — the route is behind a login/guard
- `flow-prerequisite` — B cannot run until A has happened (cart before checkout)
- `uses-component` — shares a UI component
- `uses-type` / `shares-data-entity` — shares a domain type or renders the same entity
- `navigates-to` — links to another feature's route

Evidence is not decoration: the next run re-checks these edges, and an edge it cannot verify gets dropped.

Finally assign every scenario a **coverage key** — its canonical intent identity, independent of wording:

```
<feature-id>/<flow-slug>/<positive|negative>[/<variant-slug>]

auth-login/happy-path/positive
auth-login/wrong-password/negative
checkout/card-declined/negative
```

Two rules that make delta mode work:
1. **One active scenario per coverage key, ever.** This is what makes duplicate scenarios structurally impossible.
2. On a `--full` rerun over an existing baseline, match new scenarios to old ones **by coverage key and reuse their TC ids**. IDs survive full rebuilds; that is the point of the key.

TC ids come from `nextScenarioId` and only ever increase. **Never reuse the id of a deprecated scenario** — run history elsewhere still refers to it.

---

## Phase 6 — Write `autoreg.md`

Write the file to `{projectFolder}/{autoregMd}` (or `{projectFolder}/autoreg.md`). Use EXACTLY this structure (omit a section only if genuinely empty — say why in a one-line note):

---

```markdown
# [App Name] — AutoReg Specification

## Application Context

[2–3 sentences: what the app does, who uses it, its primary purpose]

**Base URL:** `[url]`
**Spec type:** ui
**Tech stack:** [e.g. React 18 + TypeScript + Tailwind; REST API at /api]
**Routing:** [history | hash] · **Rendering:** [SPA | SSR | MPA]
**Project folder:** `[absolute path]`
**App source:** `[absolute path(s)]`
**Generated:** [ISO date] · **Source commit:** [git short SHA if available]

---

## Environment & Prerequisites

- App must be running at `[url]` ([how: npm run dev / docker compose up …])
- Database state: [seeded via X | empty | live data — counts unreliable]
- Writes allowed: [yes / no / only these: …]
- Out of scope: [OAuth redirect, payment iframe, … — from Phase 3i, with workaround per item]

---

## Authentication & Test Accounts

| Role | Identifier | Credential | Source | Notes |
|------|-----------|------------|--------|-------|
| user | qa.autoreg@example.com | {{user_password}} | user (pending) | standard account |
| admin | … | … | … | … |

**Login flow:** navigate `[url]/login` → fill `input[name=email]`, `input[name=password]` → click `button[type=submit]` → on success redirects to `/dashboard`; on failure `.error-message` shows "Invalid email or password".
**Fresh-user pattern:** [register flow steps, or "not available"]
**Logout:** [trigger selector → post-logout assertion]

---

## Pages and Routes

| Route | Method | Auth | Purpose | Component / file |
|-------|--------|------|---------|-----------------|
| `/` | GET | public | [purpose] | `[File.tsx]` |
| `/login` | GET | public | [purpose] | `[LoginPage.tsx]` |
| `/api/auth/login` | POST | public | [purpose] | `[authController.ts]` |
[all routes — include REST API routes that affect what the UI shows]

---

## Confirmed UI Selectors

Every selector below was extracted directly from source code. Best selector listed first (tiers: testid > id > form semantics > aria > structure > text > class).
Format: `[description]  →  [selector(s)]  ([tag], [SourceFile])`

### Global / Layout
```
Navigation bar        →  nav / .navbar              (nav, Layout.tsx)
User menu button      →  [aria-label=User menu]     (button, Header.tsx)
Toast container       →  [data-testid=toast] / .toast   (div, ToastProvider.tsx)
```

### [Page Name] — `/route`
```
Email input           →  input[name=email] / input[type=email] / [placeholder*=email i]   (input, LoginForm.tsx)
Password input        →  input[name=password] / input[type=password]                       (input, LoginForm.tsx)
Submit button         →  button[type=submit] / text=Sign in                                (button, LoginForm.tsx)
Error message         →  [data-testid=login-error] / .error-message                        (p, LoginForm.tsx)
Loading spinner       →  [aria-busy=true] / .spinner                                       (div, LoginForm.tsx)
```

[Repeat for EVERY page and route found]

---

## CSS Classes (from stylesheets)

[Group by concern: loading/state, error/validation, success, card/list-item, active/selected. One line each: class — meaning (file). Mark CSS-module classes "hashed — not a usable selector".]

---

## Domain Types

```typescript
// EVERY relevant interface, type alias, enum, and validation schema — verbatim
```

[Follow with validation rules extracted from schemas: field → rule → exact error message.]

---

## Page Behaviors and Transitions

### [Feature] — Network request (has loading state)
```
Trigger:     [user action]
Loading:     [loading-selector] appears     → wait: visible
Loading:     [loading-selector] disappears  → wait: not_exists
On success:  [result-selector] visible  OR  redirect to [/url]
On failure:  [error-selector] visible, text = "[exact error text]"
```

### [Feature] — Client-side instant (NO network, NO loading)
```
Trigger:     [user action, e.g. click filter button]
Effect:      DOM updates immediately — no wait step
Assert:      [selector] visible / count = N
Active mark: [active-class-selector] on selected item
```

### [Feature] — Form submission with redirect
### [Feature] — Modal / Dialog (open trigger, container selector, close, not_exists after close)
### [Feature] — Debounced search ([N]ms debounce — type, then wait for loading)
[Add a section for every distinct pattern found]

---

## Test Data Catalog

Every value used in any scenario step. `{{key}}` tokens below are resolved by AutoReg at import time.

| Key | Value | Type | Source | Used in |
|-----|-------|------|--------|---------|
| user_email | qa.autoreg@example.com | email | generated | login scenarios |
| user_password | {{user_password}} | secret | user (pending) | login scenarios |
| invalid_password | WrongPass123! | string | generated | negative login |
| search_term_known | "pizza" | string | seed (db/seeds.rb) | search — returns 1 result |
| [every other value referenced by scenarios] | | | | |

Invalid-variant table (for negative scenarios):

| Field | Invalid value | Expected error text (verbatim) |
|-------|--------------|-------------------------------|
| email | not-an-email | "Enter a valid email address" |
| [each validated field] | | |

---

## Invalid / Non-existent Selectors

These DO NOT exist in this app's DOM. Never use them:

```
✗ .results-container   — use [correct-selector] instead
✗ #submit              — button has no id; use button[type=submit]
✗ .card_x7f3a          — hashed CSS-module class; use [data-testid=product-card]
[all likely wrong guesses for THIS app]
```

---

## Known Element Counts

[Only if the data set is fixed/seeded — cite the seed source. Omit with a note if data is live/dynamic.]

```
All products (no filter)      →  .product-card count = 24   (prisma/seed.ts)
After "In Stock" filter       →  .product-card count = 18
```

---

## Search Terms That Return Known Results

[Only for fixed data sets — cite source. Omit with a note otherwise.]

```
"pizza"   →  1 result   (seed: Pizza Palace)
""        →  [empty-search behaviour]
```

---

## Open Questions

[Every assumption not confirmed by the user. Empty section = everything confirmed.]

- [ ] {{user_password}} — needs a real test-account password before login scenarios can run
- [ ] Is staging seeded identically to the seed files read here?

---

## Change Log

[Newest first, most recent 10 versions. MUST be a table — see the warning below.]

| Version | Date | Mode | Commits | Features | Scenarios |
|---------|------|------|---------|----------|-----------|
| 3 | 2026-09-09 | delta | abc1234..def5678 | +wishlist, ~auth-login | +TC-013, +TC-014, ~TC-002, -TC-007 |
| 2 | 2026-08-14 | delta | 9f2b1c0..abc1234 | +cart | +TC-011, +TC-012 |
| 1 | 2026-07-02 | full | 9f2b1c0 | initial: 5 features | TC-001…TC-010 |

---

## Test Scenarios

[8–25 scenarios covering all major flows. Rules: only selectors from Confirmed UI Selectors; every scenario independently runnable (starts with a Navigate step, performs its own login if needed); mix positive and negative; only values from the Test Data Catalog.]

## Positive Scenario: TC-001 — Login with valid credentials
- Navigate to [full URL]/login
- Fill the Email field (input[name=email]) with "qa.autoreg@example.com"
- Fill the Password field (input[name=password]) with "{{user_password}}"
- Click "Sign in" (button[type=submit])
- Verify loading spinner appears ([aria-busy=true])
- Verify loading spinner disappears
- Verify URL contains "/dashboard"
- Verify dashboard heading is visible ([data-testid=dashboard-title])

## Negative Scenario: TC-002 — Login with wrong password shows error
- Navigate to [full URL]/login
- Fill the Email field (input[name=email]) with "qa.autoreg@example.com"
- Fill the Password field (input[name=password]) with "WrongPass123!"
- Click "Sign in" (button[type=submit])
- Verify error message is visible ([data-testid=login-error])
- Verify error text says "Invalid email or password"

[Continue: registration, search/browse, CRUD create, CRUD invalid input, filter/sort (no waits if instant), checkout, checkout invalid, logout, role-restricted access denied, … until all major flows are covered]
```

---

## Phase 7 — Self-verify before finishing (mandatory)

Run this checklist against the file you just wrote. Fix violations, then re-check:

1. Every selector in every scenario step appears in **Confirmed UI Selectors**.
2. No forbidden selector anywhere (hashed/module classes, `sc-*`/`css-*`, generated ids, nth-child).
3. Every scenario header matches one of the four parser formats exactly.
4. Every scenario starts with a `Navigate` step and is self-contained (does its own login when needed).
5. Every filled value exists in the **Test Data Catalog**; every `{{key}}` has a catalog row.
6. No `wait for loading` steps after client-side instant interactions; loading waits present after every network interaction.
7. Every route in the Pages table is exercised by at least one scenario, OR listed as out of scope.
8. Every negative scenario asserts the EXACT error text documented in Domain Types / Test Data.
9. Attribute selectors in scenario steps are written WITHOUT inner quotes (see rule 7 below).
10. Open Questions lists every unconfirmed assumption.
11. Every authored interaction count for a bounded/stateful widget (stepper/wizard/carousel clicks, increment/decrement clicks, repeated pagination clicks) matches the transition logic and bounds traced in 3j — not an assumed formula. Re-derive it from the component source (including library/plugin defaults) if you can't cite the exact conditional.
12. Every route derived from a content-collection filename was checked against the loader's reserved override keys (3d) — not asserted from the schema alone.
13. **The `## Change Log` section is a TABLE, with no `- ` bullet lines anywhere inside it.** The AutoReg parser treats any `##` heading followed by bullets as a test scenario, so a bulleted Change Log is imported as a bogus test. This is not a style preference.
14. Every scenario has a coverage key, and no coverage key appears on two active scenarios (Phase 5.5).
15. The baseline you are about to write lists every feature, edge and scenario you actually produced, and every file you read carries a current hash.
16. `## Application Context` contains the line `**Spec type:** ui` — the AutoReg app and the `generate-autoreg` router use it to tell UI specs from API specs.

---

## Phase 8 — Sign and seal (mandatory, LAST step that touches `autoreg.md`)

Every authentic `autoreg.md` carries a cryptographic signature footer issued by the AutoReg cloud. In DELTA mode, `autoreg.delta.md` must carry its own signature too. The signed report records hashes of both the complete spec and `.autoreg/delta.json`; AutoReg checks all three before it uses the machine delta. Do not edit either Markdown file after signing.

(Phase 9 runs after this one, but it only writes `.autoreg/` — it never touches the signed spec.)

Signing is part of this command. Never ask the user for separate signing permission or give them manual signing steps. In normal progress messages, show only the `signature:` field of the final summary. If signing fails, explain the actual failure because an unsigned file cannot be used in the current AutoReg workflow creation dialog.

### Primary path — have the AutoReg extension sign the confirmed workflow file

If this workspace is open in a VS Code-family IDE with the AutoReg extension (the one that installed this skill), the extension performs the cloud request. The coding agent must not send either Markdown file to the cloud itself. The extension watches `autoreg.md` and `autoreg.delta.md` inside the open workspace. For a workflow folder outside that workspace, hand its path to the extension through a local request file in the open app workspace.

1. Save the finished `autoreg.md` and, in DELTA mode, the final `autoreg.delta.md` with both hash lines filled in after `.autoreg/delta.json` was written.
2. If the workflow folder is outside every open IDE workspace folder, write valid JSON to `<open app workspace>/.autoreg-sign-request.json`: `{"workflowFolder":"<absolute confirmed workflow folder>","files":["autoreg.md","autoreg.delta.md"]}` in DELTA mode, or use only `"autoreg.md"` in FULL mode. Escape backslashes in Windows paths, or use forward slashes. The local request contains paths and file names, never document bodies. The extension consumes and removes it, then signs the requested files in the workflow folder. Do not write the request into the external workflow folder: the extension cannot watch it there.
3. Wait up to 30 seconds, then re-read the END of every requested Markdown file. Each must end with its own `<!-- AUTOREG-SIGNATURE-V1 … -->` block. Do not edit either file again.
4. If it remains unsigned, remove any leftover request file, report that extension signing did not complete, and point to the **AutoReg Signing** output channel. Do not attempt a direct cloud request from the coding agent in this IDE path, and do not describe the spec as ready to import. Continue to Phase 9 so the baseline is preserved.

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

Outside the IDE, DELTA mode runs this once for `autoreg.md` and once with the final argument changed to `autoreg.delta.md`. The file name selects the correct document type. This command works in Bash and PowerShell. Check both footers before claiming success.

Handling outcomes (either path):
- **Success** — file now ends with the `AUTOREG-SIGNATURE-V1` footer. Do NOT edit the file after this point; any change invalidates the signature. If you must fix something, edit and re-run this phase.
- **HTTP 422** — the cloud's structural lint rejected the file. Fix the reported spec or delta report problems, re-verify, and re-sign.
- **HTTP 403 with "error code: 1010"** — the request was blocked at the network edge for missing/blocked User-Agent. Ensure the `User-Agent: AutoReg-SpecSigner/1.0` header is present exactly as shown.
- **Network failure, endpoint unavailable, or an automatic approval review blocks the request** — leave the file UNSIGNED and report that signing could not complete. An unsigned spec cannot be used in the current AutoReg workflow creation dialog. NEVER construct a signature footer yourself — a fabricated signature causes the import to be rejected as tampered. Do not ask the user for a separate signing permission prompt; if the execution environment blocks this external request, state that limitation plainly.

Then print a one-line summary:
```
autoreg.md (ui) written: [N] pages, [N] selectors, [N] types, [N] data entries, [N] scenarios ([N] positive, [N] negative), [N] open questions, signature: [signed <keyId> | UNSIGNED]
baseline: .autoreg/baseline.json v[N] ([N] features, [N] dependency edges) — re-run this skill after changing your app and only the differences get regenerated
```
If there are open questions, list them right after the summary and ask the user to answer them now.

Then continue to Phase 9 — the run is not finished until the baseline exists.

---

## Phase 9 — Persist the baseline (mandatory, ALL modes, after signing)

The baseline is the memory that makes the next run a delta. Write it every time, in every mode. A run that produces `autoreg.md` but no baseline forces the next run to do a full re-analysis.

Layout, all inside the **project folder** (next to `autoreg.md`):

```
<project folder>/
  autoreg.md                # the complete signed spec — the file AutoReg imports
  autoreg.delta.md          # delta runs only: human-readable change report
  .autoreg/
    baseline.json           # app model + coverage map (schema below)
    delta.json              # delta runs only: machine contract for the AutoReg app
    history/
      baseline.v1.json      # previous versions, newest kept, oldest pruned at 10
    defects/                # owned by AutoReg (app defects it filed for a coding agent)
    fixes/                  # owned by the fix-autoreg-defect skill (the coding agent's reports)
```

`defects/` and `fixes/` belong to the AutoReg ↔ coding-agent feedback loop. This skill never reads, writes, hashes or prunes them.

Write order: copy the current `baseline.json` to `history/baseline.v<its specVersion>.json`, prune history beyond 10 files, write the new baseline to `baseline.json.tmp`, then rename it over `baseline.json`. The rename is what makes a half-written baseline impossible.

Tell the user once, on the first run that creates it: if the workflow folder is versioned, commit `.autoreg/` so the whole team shares one baseline. The workflow folder is independent of the app's code and is never assumed to be inside its repository. If the folder has no `.gitignore`, offer this one:

```
# AutoReg workflow — if you version this folder, keep these out
runs/                    # screenshots, videos, traces — large and per-machine
environments.json        # test-parameter values, including secrets in plain text
.autoreg/session.json    # per-session MCP discovery (pid, port, token)
```

### 9a. `baseline.json` schema (schemaVersion 1)

```jsonc
{
  "schemaVersion": 1,
  "specVersion": 3,                   // increments on EVERY generation
  "generatedAt": "2026-09-09T12:00:00Z",
  "skillVersion": "2.0.0",
  "mode": "delta",                    // "full" | "delta" | "bootstrap"
  "specKind": "ui",                   // "ui" | "api" — which skill produced this baseline; the generate-autoreg router reads it

  "specFile": "autoreg.md",
  "specHash": "sha256:…",             // canonical hash of autoreg.md (see 9b)

  "app": {
    "name": "MyApp",
    "baseUrl": "http://localhost:3000",
    "techStack": ["React 18", "TypeScript", "Express"],
    "sourceRoots": [
      { "path": "C:/apps/myapp",
        "git": { "commit": "abc1234…", "branch": "main", "dirty": true } }
    ]
  },

  // Every file read during analysis. Key = "<rootIndex>:<path relative to that root>".
  "fileIndex": {
    "0:src/pages/LoginPage.tsx": { "hash": "sha256:…", "features": ["auth-login"], "role": "ui" },
    "0:src/components/Button.tsx": { "hash": "sha256:…", "features": ["*"], "role": "shared-ui" },
    "0:locales/en.json":         { "hash": "sha256:…", "features": ["*"], "role": "i18n" }
    // role: ui | api | route-config | validation | types | styles | i18n | seed | config | shared-ui | other
    // features: ["*"] marks a cross-cutting file — a change there triggers a broad VERIFY pass
  },

  "features": [
    {
      "id": "auth-login",             // permanent — never renamed
      "name": "Login",
      "description": "Email/password login with inline error surface",
      "status": "active",             // "active" | "removed"
      "routes": ["/login", "POST /api/auth/login"],
      "files": ["0:src/pages/LoginPage.tsx", "0:src/components/LoginForm.tsx"],
      "selectors": ["input[name=email]", "input[name=password]", "button[type=submit]"],
      "types": ["LoginSchema"],
      "errorTexts": ["Invalid email or password"],
      "dataKeys": ["user_email", "user_password"],
      "dependsOn": [],
      "scenarios": ["TC-001", "TC-002"],
      "introducedIn": 1,
      "lastModifiedIn": 3
    }
  ],

  "dependencyEdges": [
    { "from": "dashboard", "to": "auth-login", "kind": "requires-auth",
      "evidence": "route guard in App.tsx" },
    { "from": "checkout",  "to": "cart",      "kind": "flow-prerequisite",
      "evidence": "CheckoutPage reads CartContext; cart must be non-empty" }
  ],

  "scenarios": [
    {
      "id": "TC-001",
      "title": "Login with valid credentials",   // WITHOUT the "TC-001 — " prefix
      "kind": "positive",
      "status": "active",                        // "active" | "deprecated"
      "revision": 2,                             // bumped on every UPDATE
      "introducedIn": 1,
      "lastModifiedIn": 3,
      "supersedes": null,
      "supersededBy": null,
      "deprecatedIn": null,
      "deprecationReason": null,
      "coverageKey": "auth-login/happy-path/positive",
      "features": ["auth-login"],                // primary first
      "selectors": ["input[name=email]", "button[type=submit]"],
      "routes": ["/login", "/dashboard"],
      "dataKeys": ["user_email", "user_password"],
      "errorTexts": [],
      "bodyHash": "sha256:…"                     // hash of this scenario's exact markdown block,
                                                 // from its "## … Scenario: …" header line
                                                 // through its last step bullet
    }
  ],
  "nextScenarioId": 15,                          // only ever increases

  "dataCatalog": [
    { "key": "user_email", "value": "qa.autoreg@example.com", "type": "email",
      "source": "generated", "confirmed": false },
    { "key": "user_password", "value": "{{user_password}}", "type": "secret",
      "source": "user (pending)", "confirmed": false }
  ],

  "openQuestions": [
    { "id": "q1", "text": "Is staging seeded identically to seed files?",
      "status": "open", "answer": null, "raisedIn": 1 }
  ],

  "changeLog": [
    { "specVersion": 3, "date": "2026-09-09", "mode": "delta",
      "commitRange": { "0": "abc1234..def5678" },
      "summary": "Added wishlist feature; login error text changed",
      "featuresAdded": ["wishlist"], "featuresModified": ["auth-login"], "featuresRemoved": [],
      "scenariosAdded": ["TC-013"], "scenariosUpdated": ["TC-002"],
      "scenariosDeprecated": ["TC-007"], "scenariosUnchanged": 10 }
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
' "/abs/path/to/app/src"
```

Hashing more files than you analysed is harmless — only files present in `fileIndex` take part in change detection, and new files are discovered from this same output. Write the result to a temp location, not into the project.

---

# DELTA MODE — Phases D0–D10

Run these INSTEAD of Phases 0–7 when the mode decision selected DELTA. After D9, run Phase 8 to sign both Markdown files, then Phase 9 to persist the baseline.

The shape of the work:

```
baseline (last analysis)  +  current source
        → ChangeSet        (which files changed)
        → Functional Diff  (what capabilities changed)
        → + dependencies   (what else is affected)
        → Testing Delta    (which scenarios to add / update / retire)
```

## D0 — Load the baseline and reconcile

1. Read `.autoreg/baseline.json`. If `schemaVersion` > 1, stop and tell the user to update the AutoReg extension — do NOT silently full-regenerate over a newer schema, it would discard information you cannot read.
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
- for added files: enough of their surroundings to place them — the route config that mounts them, their parent page, their importers;
- changed cross-cutting files (`features: ["*"]`) and what they feed: i18n files → the exact error texts scenarios assert; seed files → known counts and search terms.

Do not rescan the app. Everything else is trusted from the baseline — that trust is what the hashes are for.

## D3 — Build the Functional Diff

Re-run the Phase 3 extraction, scoped to D2's files, and diff the result against the baseline's feature records. Classify each touched feature as `added`, `modified`, or `removed`, and describe each change with a typed detail:

```
route-added | route-removed | route-auth-changed
selector-added | selector-removed | selector-renamed
validation-changed | error-text-changed | type-changed
behavior-changed   (loading pattern, network↔instant, debounce timing)
flow-changed | seed-data-changed | role-added | role-removed
```

Record `before` and `after` for anything renamed or reworded — the delta cannot be applied mechanically without both halves.

New features get a new permanent `id` (check it against every id ever used, including `status: "removed"` ones). Extend `dependencyEdges` for what you found: a new route behind a guard gets a `requires-auth` edge, a new page reachable from an existing one gets `navigates-to`, and so on.

## D4 — Propagate impact

1. **REVIEW** — every feature named in the Functional Diff.
2. **VERIFY, one hop** — every feature with an edge pointing at a REVIEW feature:
   - `flow-prerequisite`, `uses-component`, `uses-type`, `shares-data-entity`, `navigates-to` → always propagate.
   - `requires-auth` → propagate **only if the auth feature itself is in REVIEW**. Otherwise every change in the app would appear to touch every logged-in page.
3. **VERIFY, second hop** — only across `flow-prerequisite` edges (product-list → cart → checkout). Stop there.
4. **Cross-cutting files.** When a `features: ["*"]` file changed, find the scenarios that actually depend on it rather than flagging everything:
   - i18n → match changed strings against scenarios' `errorTexts`
   - seed/fixture → features owning Known Element Counts or search-term assertions
   - shared UI component → features whose `selectors` intersect that component's

If more than 60% of active features end up impacted, this is not a delta. Say so and recommend `--full`; non-interactively, run FULL and note it in the summary.

## D5 — Classify every scenario (the Testing Delta)

Give each **active** scenario exactly one classification.

| Class | When | What to do |
|---|---|---|
| **UNCHANGED** | none of its features are in REVIEW or VERIFY, and none of its selectors, routes, error texts or data keys appear in the Functional Diff | copy its block through byte-for-byte; verify its `bodyHash` still matches |
| **VERIFY** | its feature is VERIFY-impacted | re-check every selector, route, exact text and interaction count it uses against current source. All still hold → treat as UNCHANGED. Anything broken → UPDATE |
| **UPDATE** | its feature is in REVIEW and the diff touches something it uses, but the intent still makes sense | rewrite the body, **keep the TC id**, bump `revision`, set `lastModifiedIn` |
| **REPLACE** | the intent itself is gone (login moved to magic-link, so "wrong password" means nothing) | deprecate the old one with `supersededBy`, author a new scenario with a fresh id, `supersedes` the old, new coverage key |
| **DEPRECATE** | its feature is `removed`, or its specific flow was removed | set `status: "deprecated"`, record `deprecatedIn` and a reason |

**Choosing between them** — the distinction that matters most:

- Selector renamed, error text reworded, redirect target moved → **UPDATE**. Mechanical substitution; keep the steps' shape.
- Validation tightened, a step added to the flow, loading behaviour appeared → **UPDATE**, restructuring steps.
- The flow no longer exists in that form → **REPLACE**.
- The feature is gone → **DEPRECATE**.
- Nothing in the diff touches it → **UNCHANGED**, and leave it alone. Do not "improve" untouched scenarios in delta mode even if you can see how. That is what `--full` is for, and silently rewriting a passing test is worse than leaving an imperfect one.

Then enumerate what is **NEW**. For each `added` or `modified` feature, list the coverage keys the change demands: the happy path, one negative per new validation rule (asserting its exact error text), a role-denied case if it is auth-gated, boundary cases for any bounded widget (rule 3j). Then author a scenario **only for keys that have no active scenario**. That check is the entire duplicate-prevention mechanism — do not skip it because a title looks different.

Keep the spec's 8–25 scenario range in mind as a soft ceiling; prefer merging near-identical intents over exceeding it.

## D6 — Ask the user (delta-scoped only)

Batch into ONE message, and ask only what the delta raises: sample data for NEW forms, credentials for NEW roles, write permission for NEW destructive surfaces, seed expectations for NEW list views.

Never re-ask anything already answered: skip every `openQuestions` entry with `status: "answered"` and every `dataCatalog` row with `confirmed: true`. Re-asking a question the user already answered is the fastest way to make this feature feel broken.

Non-interactive: proceed with generated values, add new Open Questions entries, prefer read-only scenarios for new destructive surfaces.

## D7 — Author the delta scenarios

Write bodies for NEW, UPDATE and REPLACE only, under the same authoring rules as full mode: the parser contract, only confirmed selectors, only catalogued values, each scenario self-contained with its own Navigate and its own login. Append any new values to the Test Data Catalog.

## D8 — Merge and write the outputs

### `autoreg.md` — surgical update, section order unchanged

- **Application Context** — refresh `Generated` and `Source commit`; add `**Spec version:** <N> (delta)`.
- **Pages and Routes, Confirmed UI Selectors, CSS Classes, Domain Types, Page Behaviors, Known Element Counts, Search Terms** — apply only the Functional Diff. Add, update and remove the affected rows and blocks; leave every other line byte-identical.
- **Authentication & Test Accounts** — only if auth or roles changed.
- **Test Data Catalog** — append new rows. Never delete a user-provided row; if its scenarios were deprecated, note `unused` instead.
- **Invalid / Non-existent Selectors** — when a selector was renamed, add the OLD one here. It is now exactly the kind of plausible-but-wrong selector this section exists to block.
- **Open Questions** — append new ones, remove answered ones.
- **Change Log** — prepend this version's row. **Table, never bullets** (Phase 7 check 13).
- **Test Scenarios** — UNCHANGED blocks byte-identical; UPDATE and REPLACE swapped in place; NEW appended at the end; DEPRECATED **removed entirely** — the AutoReg app must never import a dead scenario. They survive in the delta report, the Change Log and the baseline.

### `autoreg.delta.md` — the delta-only report

Only new and changed material, with references rather than copies for everything unchanged:

```markdown
# [App Name] — AutoReg Delta Report — spec v3

**Base:** spec v2 (2026-08-14, commit `abc1234`) → **Target:** commit `def5678` (2026-09-09)
**Complete spec:** `autoreg.md` — import that, not this file.
**Complete spec SHA-256:** `sha256:<canonical autoreg.md hash>`
**Machine delta SHA-256:** `sha256:<hash of exact .autoreg/delta.json bytes>`

## Change Summary
- Features: 1 added (wishlist) · 1 modified (auth-login) · 1 removed (guest-checkout)
- Scenarios: 2 new · 1 updated · 1 deprecated · 10 unchanged

## Functional Diff
### wishlist — added
[routes, what it does, evidence files]
### auth-login — modified
- Error text: "Invalid email or password" → "Incorrect credentials, try again" (locales/en.json)
- Selector renamed: [data-testid=login-error] → [data-testid=auth-error] (LoginForm.tsx)
### guest-checkout — removed
[evidence]

## Downstream Impact
| Feature | Via | Result |
|---|---|---|
| dashboard | requires-auth ← auth-login | verified — no scenario changes needed |
| checkout | navigates-to ← guest-checkout | TC-009 updated (guest link assertion removed) |

## New Scenarios
[full scenario blocks — same parser contract as autoreg.md]

## Updated Scenarios
### TC-002 (rev 2) — error text and selector changed
[full replacement block]

## Deprecated Scenarios
| ID | Title | Reason | Superseded by |
|---|---|---|---|
| TC-007 | Guest checkout happy path | guest-checkout removed in v3 | — |

## Unchanged Scenarios (references — see autoreg.md)
| ID | Title | Feature |
|---|---|---|
| TC-001 | Login with valid credentials | auth-login |
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
      "coverageKey": "wishlist/add-item/positive",
      "title": "Add an item to the wishlist", "category": "positive",
      "description": "…", "bodyHash": "sha256:…",
      "reason": "feature wishlist added" },

    { "op": "update", "tcId": "TC-002",
      "coverageKey": "auth-login/wrong-password/negative",
      "reason": "error text changed", "bodyHash": "sha256:…",
      "changedAspects": ["assertion-text"],
      "patch": { "substitutions": [
        { "field": "expected",
          "from": "Invalid email or password",
          "to": "Incorrect credentials, try again" }
      ] } },

    { "op": "deprecate", "tcId": "TC-007",
      "coverageKey": "guest-checkout/happy-path/positive",
      "reason": "guest-checkout removed in v3" },

    { "op": "unchanged", "tcId": "TC-001",
      "coverageKey": "auth-login/happy-path/positive" }
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
- `assertion-text`, `selector`, `url`, `value` → applied mechanically, no browser, no LLM. Requires a `patch.substitutions` entry giving exact `from` and `to`, with `field` one of `expected`, `selector`, `value`, `waitFor`, `url`.
- `flow`, `steps`, or anything else → the app regenerates the scenario against the live app.

Only claim a mechanical aspect when the substitution is genuinely exact and complete. The app verifies that each substitution actually matched something; one that matches nothing is reported as drift, not applied.

After writing the final `.autoreg/delta.json`, compute its SHA-256 over the exact UTF-8 file bytes. Compute the complete spec hash with Phase 8's canonicalization (signature removed, LF line endings, one trailing newline). Put both lowercase `sha256:<64 hex>` values in the report above. Do this before D9 verification and before signing; do not rewrite the JSON or either Markdown file after signing.

## D9 — Delta self-verification (mandatory)

Run the whole Phase 7 checklist against the merged `autoreg.md`, then these:

1. Every UNCHANGED scenario block is byte-identical to the previous spec (compare to its recorded `bodyHash`).
2. Exactly one active scenario per coverage key. No TC id appears twice. Every id is below `nextScenarioId`.
3. Every selector, route and exact text used by NEW and UPDATED scenarios was confirmed against current source **in this run** — cite the file.
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
autoreg.md updated (delta v3): +2 scenarios (TC-013, TC-014), ~1 updated (TC-002), -1 deprecated (TC-007), 10 unchanged; 1 feature added, 1 modified; 2 open questions; signature: signed <keyId>
delta report: autoreg.delta.md · machine delta: .autoreg/delta.json
Apply it in AutoReg: ask the agent to "apply the spec delta" — it previews the changes before touching any test.
```

---

# BOOTSTRAP MODE — Phase B

For an app that already has an `autoreg.md` from before delta mode existed: adopt the existing spec as baseline v1 without regenerating it.

**The rule that matters: do not rewrite scenario bodies.** The whole point is to adopt working coverage untouched. The only permitted edit is assigning TC ids to scenarios that lack them.

1. **Parse the existing `autoreg.md`** (canonical form): scenario blocks with their ids, titles, kinds and steps; Pages table; Confirmed UI Selectors; Domain Types; Test Data Catalog; Open Questions. From each scenario's steps extract the selectors, routes, quoted values and asserted texts it uses — that is what links it to features.
2. **Assign missing TC ids** in file order (`TC-001`, `TC-002`, …). This is the one allowed spec edit; re-sign afterwards via Phase 8.
3. **Light source scan.** Run Phase 2 discovery and the 9b hasher to build `fileIndex`. Do not redo the full Phase 3 extraction where the spec already states the fact — you are adopting it, not auditing it. Infer features by grouping routes and pages, map each scenario to features via its routes and selectors, derive coverage keys, and extract dependency edges from imports, guards and flow ordering.
4. **Consistency check.** Verify each scenario's selectors still exist in current source. Mismatches mean the app drifted after the spec was written: report them and mark those scenarios stale — they will surface as UPDATEs in the delta that follows. Do not fix them here.
5. **Write baseline v1** with `mode: "bootstrap"`, `specHash` of the current spec, a `bodyHash` per scenario, and `nextScenarioId` = highest id + 1.
6. **Continue straight into DELTA (D1 onward)** in the same run. If the app has not changed since the spec was written, D1 finds nothing and bootstrap was the whole run — which is the correct outcome.

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

2. **Steps are plain `- ` bullets** starting with one of these verbs: `Navigate` / `Go to` / `Open`, `Fill` / `Enter` / `Type`, `Click` / `Press` / `Select`, `Verify` / `Assert` / `Check`, `Wait`, `Scroll`.

3. **Fill steps**: selector in parentheses BEFORE the word "with"; the value is the LAST thing on the line, wrapped in double quotes:
   `- Fill the Email field (input[name=email]) with "qa.autoreg@example.com"`

4. **Click steps**: put the visible label in double quotes first, then the selector in parentheses:
   `- Click "Sign in" (button[type=submit])`

5. **Verify steps** must specify exactly one check:
   - `- Verify [description] is visible ([selector])`
   - `- Verify [selector] contains text "[exact text]"`
   - `- Verify [N] [items] are visible ([selector])`
   - `- Verify URL contains "/path"`
   - `- Verify [description] is not visible / disappears ([selector])`
   Prefer `[data-testid=…]` or `#id` selectors inside Verify steps — the fallback parser extracts only those hints.

6. **Navigate steps** use full URLs: `- Navigate to http://localhost:3000/login`.

7. **Quotes inside attribute selectors in scenario steps — only when the value needs them.** The step parser treats the first quoted string on a line as the value/label, so quoting a selector's attribute value on a scenario step line risks corrupting that extraction. But CSS itself requires quotes around any attribute value containing a character outside `[a-zA-Z0-9_-]` (`/`, `:`, spaces, `?`, `.`, …) — an unquoted `a[href^=/recipes/]` is invalid CSS and fails at runtime, not just a parser inconvenience. So:
   - Plain identifier values stay bare: `[data-testid=login-error]`, `input[type=email]`, `button[type=submit]`.
   - Values with any other character MUST be quoted: `a[href^="/recipes/"]`, `a[href="/recipes/tag/soup"]`.
   (Quoted attribute values are always fine in the Confirmed UI Selectors section — this rule's bare-value-preferred guidance applies to scenario step lines only, and even there, only to values that don't need quoting to be valid CSS.)

8. **Every domain type verbatim** — never summarise or paraphrase type bodies.

9. **Exact text everywhere** — error messages, button labels, headings: copy the rendered string (resolve i18n keys through the locale files), never approximate.

10. **Determinism** — no assertions on timing, animation, or counts of live/dynamic data. If a count is not backed by seed data, assert "at least 1" semantics via visibility instead.

11. **Signature footer is sacred** — the `<!-- AUTOREG-SIGNATURE-V1 … -->` block must be the last thing in the file, added only by Phase 8's signing endpoint. Never write, copy, or modify one by hand, and never edit the file after signing (re-sign instead).
