Generate the `autoreg.md` test specification for an AutoReg project by working out what kind of application this is and running the matching skill. This file is a **router**: it detects the project type, then reads and executes one of its sibling skills. It never analyses the app in depth, never writes `autoreg.md` itself, never signs anything and never calls the cloud.

Skill version: 4.0.0

```
/generate-autoreg ──▶ check & determine project type ──┬── UI ────────▶ generate-ui-autoreg
                                                        ├── API ───────▶ generate-api-autoreg
                                                        ├── BOTH ──────▶ generate-ui-autoreg ──────▶ generate-api-autoreg
                                                        └── LIB/other ─▶ not supported — say so and stop
```

---

## Inputs and shared storage

Run `/generate-autoreg [--ui|--api|--both] [--full|--delta|--bootstrap]` from the application source workspace. The current workspace root is the app source. Do not ask for a workflow folder or app source path. If the workspace contains several independent apps, ask which application subfolder to analyze; otherwise use the current folder. Explicit additional source roots may be supplied for multi-repository apps.

On Windows, `home = %USERPROFILE%`. For the directory containing the uploadable `autoreg.md`, compute `identity = path.resolve(root).replaceAll('\\','/').toLowerCase()`, `slug = path.basename(root).replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'app'`, and `hash = first 12 lowercase hex characters of SHA-256(identity)`. The internal workflow is `<home>/.local/.AutoReg/workflows/<slug>-<hash>/<ui|api>`. This matches the desktop app and extension. On Windows set the Hidden attribute on `<home>/.local/.AutoReg` (`attrib +h`); the desktop app and extension also do this when they run.

All baselines, machine deltas, signed delta reports, defects, fixes, plans, tests, runs, manifests, environments, and other processing artifacts go into the private workflow. The only generated AutoReg file in the app source tree is the uploadable `autoreg.md`; keep a signed copy in the private workflow for the desktop agent. Never create `.autoreg/`, `autoreg.delta.md`, a signing request, or an `.ar` manifest in the app source tree. Pass the derived private workflow path first and the source root next to the sibling skill, followed by additional analysis roots and mode flags.

---

## Step 1 — Delta runs follow the baseline, not detection

Check the derived private `ui` and `api` workflow paths for the current source root, plus the `ui/` and `api/` spec subfolders when present. Read each `.autoreg/baseline.json` that exists. A single valid baseline selects its `specKind` for a delta run; two valid baselines select BOTH. A baseline without `specKind` belongs to the UI skill. Use the matching spec folder for each workflow. A forced other kind uses its own source spec and private workflow. If a baseline has a newer unsupported schema, stop and ask for an updated skill; never overwrite it.

A `--ui` / `--api` / `--both` flag always wins over both the baseline and detection.

---

## Step 2 — Detect the project type (≤ 1 minute, manifests and directory shape only)

Do NOT read application source files here — that is the sub-skill's job. Read only dependency manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `Gemfile`, `composer.json`, `pom.xml`, `build.gradle`, `*.csproj`, `go.mod`, `Cargo.toml`) and list directories. Skip `node_modules/`, `vendor/`, `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `target/`, `bin/`, `obj/`, `coverage/`, `.git/`.

Collect **UI signals** and **API signals** across every source root. Each signal is a file you actually saw.

| Type | Signals (any one is enough) |
|------|-----------------------------|
| **UI** | A UI framework dependency: `react-dom`, `vue`, `@angular/core`, `svelte`, `next`, `nuxt`, `astro`, `@remix-run/*`, `solid-js`, `preact`, `@builder.io/qwik`, `ember-source`, `lit`. A bundler/app config: `vite.config.*`, `webpack.config.*`, `angular.json`, `next.config.*`, `nuxt.config.*`, `svelte.config.*`, `astro.config.*`. View/template trees: `app/views/**` (Rails), `templates/**/*.html` (Django/Flask/Jinja), `resources/views/**/*.blade.php` (Laravel), `src/main/resources/templates/**` (Spring), `**/*.cshtml` / `**/*.razor` (ASP.NET), `**/*.component.html` (Angular). `pages/**` or `app/**/page.{tsx,jsx}`. Three or more `*.html` files outside `docs/`, `public/`, `coverage/`. |
| **API** | A server framework dependency: `express`, `fastify`, `@nestjs/core`, `hono`, `koa`, `@hapi/hapi`, `restify`, `@trpc/server`, `apollo-server*`, `@apollo/server`, `graphql-yoga`, `mercurius`; `fastapi`, `flask`, `djangorestframework`, `starlette`, `sanic`; `sinatra`, `grape`, `rails` together with `config/routes.rb` containing `namespace :api` or `config.api_only`; `laravel/framework` together with `routes/api.php`; `spring-boot-starter-web` / `spring-boot-starter-webflux`; `Microsoft.AspNetCore.*` together with `[ApiController]` or `MapGet|MapPost` in `Program.cs`; Go `net/http`, `gin-gonic/gin`, `labstack/echo`, `go-chi/chi`, `gofiber/fiber`. Route-handler trees: `app/api/**/route.{ts,js}`, `pages/api/**`, `server/api/**`, `src/routes/**/+server.{ts,js}`, `urls.py` containing `path("api/`. An API description: `openapi.{json,yaml,yml}`, `swagger.{json,yaml}`, `@nestjs/swagger`, `*.graphql` / `schema.gql`. |
| **LIB / other** (not supported) | No UI and no API signal, and the manifest describes a library or tool: `package.json` with `main`/`module`/`exports`/`types` and **no** `scripts.start`, `scripts.dev` or `scripts.serve`; `pyproject.toml`/`setup.py` without an application entry point; `Cargo.toml` with `[lib]` only; a `bin`-only CLI; a monorepo whose workspaces are all libraries. Also: nothing detected at all. |

Decision:

```
UI signals only        → UI
API signals only       → API
UI and API signals     → BOTH
neither, or LIB        → NOT SUPPORTED
```

Special cases — state them explicitly when they apply:

- **Meta-frameworks with API routes** (Next.js `app/api/**/route.ts` or `pages/api/**`, Nuxt `server/api/**`, SvelteKit `+server.ts`, Remix resource routes): **BOTH**. The UI skill documents those routes as UI context; the API skill tests them directly.
- **Monorepo** (`apps/*`, `packages/*`, `services/*`): classify each application package. Library packages do not turn the result into LIB. More than one application package → ask which application to target, listing the evidence. Non-interactive: choose the current app workspace if it contains one; otherwise stop and require a source subfolder.
- **Ambiguous** (for example only an `openapi.yaml` plus static HTML docs; a `package.json` with both `react-dom` and `express` where Express only serves the built bundle — check for `express.static` and no other routes): ask one question — "This looks like an API described by `openapi.yaml`; no server framework is in `package.json`. Treat it as an API project? [API / UI / Both]". Non-interactive: API when an API description exists, else UI.
- **NOT SUPPORTED**: print exactly one short paragraph — what was detected (name the files), why it reads as a library or CLI, and that AutoReg tests *running applications* (a UI in a browser, or an HTTP API). Suggest `--ui` or `--api` with an explicit source root if the detection is wrong. Then **stop**. Never generate a spec for a library.

Before dispatching, print one line, for example:

```
Project type: API (evidence: package.json depends on @nestjs/core; src/orders/orders.controller.ts uses @Controller)
Project type: UI + API (evidence: next in package.json; app/api/orders/route.ts exports POST)
```

---

## Step 3 — Dispatch to the sibling skill

The three skills are always installed side by side. Locate the sibling file **in the same directory as this file**, with the **same extension** as this file (`.md`, `.mdc` or `.prompt`):

- UI → `generate-ui-autoreg.<ext>`
- API → `generate-api-autoreg.<ext>`

Read the sibling file **in full** and execute it with the derived private workflow path, app source root, any additional analysis roots, and remaining mode flags (router flags removed). Do not summarise it, do not paraphrase it, and do not substitute an older copy of it from memory — the sibling file on disk is the only authoritative version. If the sibling file is missing, stop and tell the user to reinstall the AutoReg skills from the AutoReg extension panel (or copy `generate-ui-autoreg` / `generate-api-autoreg` next to this file). Never attempt to generate the spec without it.

### UI

Execute `generate-ui-autoreg` with `<private UI workflow> <source root> <additional roots…> [mode flags]`. That is the whole run.

### API

Execute `generate-api-autoreg` with `<private API workflow> <source root> <additional roots…> [mode flags]`. That is the whole run.

### BOTH — separate source specs and private workflows

If the app already has distinct UI and API source subfolders, write one `autoreg.md` in each. If both share one source root, create `<app root>/ui/autoreg.md` and `<app root>/api/autoreg.md`. These subfolders contain only the uploadable specs; analyze the shared app root as an additional source root. Derive each private workflow from the directory containing its spec, then run the corresponding sibling skill to completion. Carry answers about URLs, credentials, and test data from the first run into the second; ask only what differs. Keep the baselines and deltas separate.

---

## What this router must never do

- Read application source files, run the clarification interview, write `autoreg.md`, sign anything, write a baseline, or call the cloud — those belong to the sub-skills.
- Ask for a workflow folder or app source path when the current workspace identifies the app. Derive each private workflow from the source spec's containing folder.
- Generate a spec for a library, a CLI or an empty project.
- Mix UI and API content into one `autoreg.md`.
