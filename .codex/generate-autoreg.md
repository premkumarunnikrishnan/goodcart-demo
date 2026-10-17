Generate the `autoreg.md` test specification for an AutoReg project by working out what kind of application this is and running the matching skill. This file is a **router**: it detects the project type, then reads and executes one of its sibling skills. It never analyses the app in depth, never writes `autoreg.md` itself, never signs anything and never calls the cloud.

Skill version: 3.0.1

```
/generate-autoreg ──▶ check & determine project type ──┬── UI ────────▶ generate-ui-autoreg
                                                        ├── API ───────▶ generate-api-autoreg
                                                        ├── BOTH ──────▶ generate-ui-autoreg ──ask──▶ generate-api-autoreg
                                                        └── LIB/other ─▶ not supported — say so and stop
```

---

## Inputs from $ARGUMENTS

Parse `$ARGUMENTS` as paths and flags, respecting quotes around paths with spaces:
- **Router flags** (recognised here, removed before dispatch): `--ui`, `--api`, `--both` — force the project type and skip detection.
- **Mode flags** (`--full`, `--delta`, `--bootstrap`, or any other `--flag`): pass through to the sub-skill **unchanged**, after the resolved paths.
- Token 1 (file path): **project folder** — the AutoReg project directory that contains the `.ar` manifest and where `autoreg.md` is written.
- Token 2+ (file paths): **app source roots** — one or more roots of the application under test. Scan ALL of them for detection.

## Step 0 — Establish both paths BEFORE detecting or generating anything (mandatory)

The project/workflow folder and the app source roots are different roles. The current working directory is usually the **app source**, not the AutoReg workflow. Never silently use it as the project folder, search for a workflow and pick one, or infer that the two folders are the same.

1. Resolve the current working directory to an absolute path. If **no path arguments** were supplied (including a flags-only invocation), ask the user in ONE message:
   > I can use `<absolute current directory>` as the app source. Is that correct? What is the absolute path to your AutoReg workflow folder (the folder containing the `.ar` file and `tests/`, or the folder where a new workflow should be written)? If the app source is elsewhere or has multiple roots, give the exact path(s).
   A reply such as "yes, workflow is `<path>`" confirms the current directory as the app source. Otherwise obtain the exact app source path(s). **Do not continue until the user has explicitly identified both roles.**
2. If **only the workflow path** was supplied, read `.autoreg/baseline.json` only to *suggest* its `app.sourceRoots[].path` as the app source. If there is no usable baseline, suggest the current directory as the app source. Ask the user to confirm the suggested path(s) or supply the correct ones. Do not treat a saved baseline path as current authorization to scan it without this confirmation.
3. If the user supplied both the workflow and app source path(s), state the resolved absolute paths and their roles before proceeding. If the paths are identical, or the first path appears to be app source rather than the intended workflow, ask the user to confirm that placement before writing anything.
4. Check that every app source root exists and contains application source. The workflow folder may be new; for an existing workflow, confirm it is the folder with the expected `.ar` file and/or `autoreg.md` and `.autoreg/baseline.json`. If an existing baseline records different source roots from those just confirmed, stop and ask whether the app moved or this is the wrong workflow. Never silently analyse only a subset of the recorded roots.
5. After confirmation, pass the **resolved absolute workflow path first** and **all resolved absolute app source roots next**, followed by mode flags, to the sibling skill. If user input is unavailable (for example in CI), stop with a short usage message requiring both paths; do not fall back to the current directory.

This path check is distinct from the sub-skill's later questions about environment, credentials and test data. Complete it before Step 1 or Step 2 and before executing either sibling skill.

---

## Step 1 — Delta runs follow the baseline, not detection

If `<project folder>/.autoreg/baseline.json` exists and parses as JSON:
- `specKind` is `"api"` → dispatch **API**. `specKind` is `"ui"` → dispatch **UI**. Skip Step 2.
- `specKind` is absent (a baseline written before this router existed) → run Step 2, but if the result is BOTH, dispatch **UI** only, because that baseline was produced by the UI skill. Say so in one line.
- If detection disagrees with a present `specKind`, say so in one line and **follow the baseline**. A delta run must never silently switch spec kinds; the user can force the other kind with `--ui` / `--api` into a different project folder.

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
- **Monorepo** (`apps/*`, `packages/*`, `services/*`): classify per application package. Library packages inside `packages/` never turn the result into LIB. More than one application package → ask which one(s) to target, listing each with its evidence. Non-interactive: take the package whose name or `homepage` matches the `.ar` manifest URL, else the first application package, and say so.
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

Read the sibling file **in full** and execute it with the paths resolved in Step 0 and the remaining mode flags (router flags removed). Do not summarise it, do not paraphrase it, and do not substitute an older copy of it from memory — the sibling file on disk is the only authoritative version. If the sibling file is missing, stop and tell the user to reinstall the AutoReg skills from the AutoReg extension panel (or copy `generate-ui-autoreg` / `generate-api-autoreg` next to this file). Never attempt to generate the spec without it.

### UI

Execute `generate-ui-autoreg` with `<project folder> <roots…> [mode flags]`. That is the whole run.

### API

Execute `generate-api-autoreg` with `<project folder> <roots…> [mode flags]`. That is the whole run.

### BOTH — one spec per workflow, two workflows

A single AutoReg workflow holds exactly one `autoreg.md`, one `.ar` manifest and one `.autoreg/baseline.json`. A UI spec and an API spec therefore go into **two workflow folders**:

- UI spec → `<project folder>`
- API spec → `<project folder>-api` (sibling folder; create it if needed, together with a copy of the `.ar` manifest whose `metadata.name` gets an `-api` suffix and whose `sources[0].url` is the API base URL once the API skill has established it)

Flow:

1. Announce `Project type: UI + API (evidence: …)`.
2. Ask ONCE, batched: "I'll generate the UI spec into `<project folder>` and the API spec into `<project folder>-api` — each becomes its own AutoReg workflow. Start with the UI spec? Options: **Yes, UI first** · **API first** · **Only UI** · **Only API** · **Use different folders**." Non-interactive: UI first, then API, default folders.
3. Run the first sub-skill to completion (it clarifies, analyses, writes, signs and persists its own baseline).
4. Ask: "UI spec done — `<N>` scenarios, signed. Generate the API spec now into `<project folder>-api`?" (or the reverse). Non-interactive: proceed. If the second folder already exists and is not empty, ask before writing into it; non-interactively write into `<project folder>-api (2)` instead of overwriting.
5. Run the second sub-skill to completion. It writes its **own** `.autoreg/baseline.json` in its own folder — the two specs never share a baseline, so later delta runs work per workflow.
6. Print a final summary naming both files, and tell the user to create **one AutoReg workflow per folder** (the New Workflow dialog shows which kind of spec it imported).

Answers the user gave to the first sub-skill's Phase 0 questions (base URL, credentials, seed data, write permission) carry over to the second: pass them along and do not re-ask what was already answered.

---

## What this router must never do

- Read application source files, run the clarification interview, write `autoreg.md`, sign anything, write a baseline, or call the cloud — those belong to the sub-skills.
- Change the order or role of user-supplied paths. Missing paths may only be filled from the user's explicit Step 0 answer.
- Generate a spec for a library, a CLI or an empty project.
- Mix UI and API content into one `autoreg.md`.
