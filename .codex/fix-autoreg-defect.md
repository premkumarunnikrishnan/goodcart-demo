Fix an application defect that AutoReg (the quality agent) filed for you, and report back so AutoReg can verify the fix. This is the coding-agent half of the AutoReg feedback loop: AutoReg found that the app violates its specification, wrote a defect record with the evidence, and handed it off; you find the cause, fix the app, and write a fix report AutoReg reads.

Skill version: 1.0.0

---

## The contract — read this first

Everything lives in the AutoReg **project folder** (the single `.autoreg/ui` or `.autoreg/api` folder with the `.ar` manifest, `autoreg.md` and `tests/`):

```
<project folder>/
  defects/DEF-0003.json        # written by AutoReg — you READ this, never edit it
  defects/DEF-0003/            # evidence: failing-step.png, live-snapshot.txt, diagnostics.json
  defects/index.json           # summary of every defect and its status
  fixes/DEF-0003.fix.json      # written by YOU — AutoReg reads it; this is your only output here
  baseline.json                # the spec's model of the app (features → files, selectors, error texts)
```

Rules that keep the loop safe:

1. **One writer per file.** You write only `fixes/<id>.fix.json`. Never modify anything under `defects/`, `baseline.json`, `delta.json`, `autoreg.md` or `tests/`. The spec changes only through the `generate-autoreg` skill; tests change only through AutoReg.
2. **Never weaken the test or the spec to make a failure go away.** If the expectation is wrong, say so in the report (`not-a-bug`) with source evidence — AutoReg will route it to the right fix.
3. **Never resolve a defect yourself.** AutoReg verifies by running the scenarios; your report says what you did, its verification decides.
4. **Secrets stay tokens.** Reproduction steps use `{{tokens}}` (e.g. `{{user_password}}`); values live in AutoReg's environment file. Never ask for them and never write them anywhere.
5. **Do not commit unless the user asks.** If they do, record the commits in the report.
6. **Discover the workflow from the app source.** The workflow path is derived from the current source folder and spec kind. An explicit defect path is optional.
7. **Behaviour change ⇒ spec regeneration.** If your fix changes anything the spec states (a text, a selector, a route, a flow), run the `generate-autoreg` skill in delta mode before reporting (Phase F6). A report with `behaviourChanged: true` and no regeneration is refused by AutoReg.

---

## Inputs from $ARGUMENTS

The current workspace is the app source. Do not ask for a workflow folder or app source path. Use the same path rule described in `generate-autoreg`: `<source root>/.autoreg/<ui|api>`, where the identity root is the app source root. Inspect the existing `.autoreg/ui/autoreg.md` and `.autoreg/api/autoreg.md` to find matching workflows. Select open defects from those workflows' `defects/` folders. If several open defects exist, show their IDs and titles and ask which one to fix. If no defect exists, say so. An explicit defect path or `DEF-nnnn` argument selects that defect directly and must be verified to belong to the current app.

Flags: `--list` prints open defects and stops; `--no-spec` skips regeneration when behaviour changes, leaving the report pending. Resolve analysis source roots from the defect's `spec.sourceRoots` or workflow baseline; never ask for their paths when recorded and still present.

---

## Phase F0 — Locate

List the defects that are waiting for a coding agent. Run this from the project folder:

```bash
node -e '
const fs=require("fs"),path=require("path");
const dir=path.join(process.argv[1],"defects");
const fixes=path.join(process.argv[1],"fixes");
for(const f of fs.readdirSync(dir).filter(f=>/^DEF-\d+\.json$/.test(f)).sort()){
  const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  let fix=null;try{fix=JSON.parse(fs.readFileSync(path.join(fixes,d.id+".fix.json"),"utf8"))}catch{}
  const claimed=fix&&fix.defectRevision===d.revision?` [report: ${fix.status} by ${fix.agent&&fix.agent.name||"?"}]`:"";
  console.log(`${d.id}  rev ${d.revision}  ${d.status}${claimed}  ${d.severity}  ${d.title}`);
}' "<project folder>"
```

Take a defect only when its stored status is `handed-off` or `reopened`. If a fix report already exists for it with `status: "in-progress"` from another agent and `claimedAt` is less than 24 hours old, tell the user and ask before taking over. If the user gave a `DEF-nnnn` that is `resolved`, `closed`, `verifying` or `needs-human`, say why you cannot take it and stop.

With `--list`, print the list and stop — nothing is written.

Resolve the app source roots from the defect's `spec.sourceRoots` (or `baseline.json`). If none of them is this repository, say so: you may be in the wrong checkout, or the defect belongs to another app — ask the user before continuing.

---

## Phase F1 — Claim

Write the claim BEFORE analysing anything — it tells AutoReg (and other agents) the defect is being worked on:

```bash
node -e '
const fs=require("fs"),path=require("path");
const [proj,id,agent]=process.argv.slice(1);
const d=JSON.parse(fs.readFileSync(path.join(proj,"defects",id+".json"),"utf8"));
const dir=path.join(proj,"fixes");fs.mkdirSync(dir,{recursive:true});
const report={schemaVersion:1,defectId:id,defectRevision:d.revision,agent:{name:agent,skillVersion:"1.0.0"},claimedAt:new Date().toISOString(),status:"in-progress"};
const p=path.join(dir,id+".fix.json");fs.writeFileSync(p+".tmp",JSON.stringify(report,null,2));fs.renameSync(p+".tmp",p);
console.log("claimed",id,"at revision",d.revision);
' "<project folder>" DEF-0003 "<your agent name, e.g. claude-code>"
```

`defectRevision` pins your work to the record you read. If AutoReg reopens or updates the defect while you work, its revision moves and your report will be rejected as stale — you then re-read and re-report.

---

## Phase F2 — Understand the defect

Read `defects/<id>.json` completely. Then tell the user, in two lines:
- **Expected** (from `spec.expectation` and `spec.scenarioBlock`): what the spec says the app does.
- **Actual** (from `failure.failedStep.error`, `failure.consoleErrors`, `failure.failedRequests`): what happened.

Then read the evidence:
- `spec.feature` — the feature's `files`, `routes`, `selectors`, `errorTexts`. **Start there.** The baseline already knows where this feature lives; `spec.evidence` lists the files the spec cites for the expectation.
- `failure.liveSnapshot` (`defects/<id>/live-snapshot.txt`) — the accessibility tree of the page at the moment of failure.
- `failure.diagnostics` (`defects/<id>/diagnostics.json`) — console errors, page errors, failed requests, 5xx responses. A `file:line` in a page error is the fastest path to the cause.
- `failure.screenshot` — look at it if you can view images.
- `failure.lastPassedRunId` — when it last passed. A recent pass with the same test means a regression: look at what changed in the feature's files since.
- `classification.rationale` and `classification.alternatives` — why AutoReg believes the app is wrong, and what else it considered.
- `handoff.instructions` — anything the user added for you.

---

## Phase F3 — Reproduce by reading the code

Trace the failing step to the code:
1. The route (`spec.feature.routes`) → the page/component that renders it.
2. The selector or text the step uses (`failure.failedStep.selector` / `expected`) → where it is rendered, and the condition under which it renders.
3. The handler behind the interaction (submit, click) → what it sets, what the render reads.

Explain the cause to the user in one paragraph before changing anything. If the app can be run locally and you have a browser tool, reproducing live is welcome but not required — the evidence is usually enough.

---

## Phase F4 — Decide

Exactly one of:
- **Real defect** → Phase F5.
- **The spec/test is wrong** — the expectation was never true in source (e.g. the spec cites a string that exists only in a dead locale key). Report `not-a-bug` (Phase F8) with the file and line that proves it. Do not touch the app.
- **Cannot reproduce** — the code plainly satisfies the expectation and the evidence does not explain the failure. Report `cannot-reproduce` with what you checked.
- **Needs information** — credentials, seed data or an environment you cannot see. Report `needs-info` with concrete `questions`.

---

## Phase F5 — Fix the application

- Make the smallest change that makes the app meet the spec's expectation. Prefer fixing the cause over patching the symptom.
- Run the app's own unit tests, type checks and linters if the project has them.
- Do not edit `tests/*.json`, `autoreg.md`, `defects/*`, `baseline.json` or `delta.json`.
- Keep a list of every file you changed with a one-line summary each — it goes in the report.

---

## Phase F6 — Did the behaviour change?

Ask yourself: does the fix change anything the spec states — a user-visible text, a selector, a route, the order of a flow, a validation rule? Compare against `spec.scenarioBlock` and `spec.feature`.

- **No** (you restored the specified behaviour) → `behaviourChanged: false`.
- **Yes, or unsure** â†’ run `/generate-autoreg --delta` from the app source root already resolved in Phase F0. The generator derives the same workflow, updates the visible `autoreg.md` and workflow baseline/delta, and signs the spec and report. Then set `behaviourChanged: true` and `specRegenerated: { "mode": "delta", "toSpecVersion": <N> }`.
- **`--no-spec` was given** → `behaviourChanged: true`, `specRegenerated: null`, and say in `notes` that the spec must be regenerated before AutoReg can verify.

---

## Phase F7 — Live verification (optional)

If an `autoreg` MCP server is available to you (tools named `autoreg_status`, `autoreg_run_scenarios`, …), call `autoreg_run_scenarios` with the ids in the defect's `scenario.scenarioId` (and any others you believe are affected). Record the result under `liveVerification` in the report. If the tool is absent or answers that AutoReg is not running, skip this phase silently — AutoReg verifies on its side anyway.

---

## Phase F8 — Report

Overwrite `fixes/<id>.fix.json` with the final report. Every field:

```jsonc
{
  "schemaVersion": 1,
  "defectId": "DEF-0003",
  "defectRevision": 2,                    // copy from the claim — the defect's revision when you read it
  "agent": { "name": "claude-code", "model": "<model if known>", "skillVersion": "1.0.0" },
  "claimedAt": "2026-09-16T10:20:00Z",
  "reportedAt": "2026-09-16T10:41:00Z",
  "status": "fixed",                      // fixed | not-a-bug | cannot-reproduce | needs-info | wont-fix
  "summary": "LoginForm read error.message before the error object existed; guarded and rendered the banner.",
  "rootCause": "handleSubmit stored the API error as a string but the JSX read error.message (LoginForm.tsx:48); the TypeError aborted the render, so the banner never mounted.",
  "changes": [ { "file": "src/components/LoginForm.tsx", "summary": "render error as string; add null guard" } ],
  "commits": [],                          // sha(s) if the user asked you to commit
  "branch": "fix/login-error-banner",     // current branch, if in git
  "behaviourChanged": false,
  "specRegenerated": null,                // or { "mode": "delta", "toSpecVersion": 5 }
  "affectedScenarios": ["TC-002"],        // spec ids you believe the fix touches (a hint for AutoReg's verification set)
  "verificationRequested": ["scenario-002"],   // stored test ids AutoReg should run
  "liveVerification": null,               // or { "runIds": [...], "result": "passed" } from Phase F7
  "questions": [],                        // for needs-info
  "notes": ""
}
```

Validate it before finishing — AutoReg rejects reports that do not satisfy the contract:

```bash
node -e '
const fs=require("fs"),path=require("path");
const [proj,id]=process.argv.slice(1);
const r=JSON.parse(fs.readFileSync(path.join(proj,"fixes",id+".fix.json"),"utf8"));
const d=JSON.parse(fs.readFileSync(path.join(proj,"defects",id+".json"),"utf8"));
const errs=[];
if(r.schemaVersion!==1)errs.push("schemaVersion must be 1");
if(r.defectId!==id)errs.push("defectId mismatch");
if(r.defectRevision!==d.revision)errs.push(`defectRevision ${r.defectRevision} != defect revision ${d.revision} (re-read the defect and re-report)`);
if(!r.agent||!r.agent.name)errs.push("agent.name required");
if(!["in-progress","fixed","cannot-reproduce","not-a-bug","needs-info","wont-fix"].includes(r.status))errs.push("bad status");
if(r.status!=="in-progress"&&!r.summary)errs.push("summary required");
if(r.behaviourChanged&&!r.specRegenerated)errs.push("behaviourChanged without specRegenerated — run generate-autoreg or say so in notes");
if(r.status==="needs-info"&&!(r.questions&&r.questions.length))errs.push("needs-info requires questions[]");
console.log(errs.length?"INVALID:\n- "+errs.join("\n- "):"report valid");process.exit(errs.length?1:0);
' "<project folder>" DEF-0003
```

Finish with three lines for the user:

```
DEF-0003 — <status>: <summary>
Changed: <files>   Spec regenerated: <yes (v5) | no | required — run generate-autoreg>
Next: in AutoReg, say "verify fixes" — or open the app; it will offer to verify.
```

The report lives in the workflow folder next to the defect, where AutoReg watches for it — nothing to copy or commit.
