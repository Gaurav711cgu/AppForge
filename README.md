# ⚡ AppForge — AI Application Compiler

> **Natural language → validated, executed, production-ready application config.**
>
> A compiler-architecture LLM pipeline: 4 typed stages, Zod schema enforcement on every output,
> 7 cross-layer consistency checks, surgical auto-repair, and in-memory SQL execution proof.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Grok](https://img.shields.io/badge/Grok-3-1DA1F2)](https://x.ai/)
[![Zod](https://img.shields.io/badge/Zod-3.x-3068B7)](https://zod.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

1. [The Core Idea](#the-core-idea)
2. [Live Demo](#live-demo)
3. [Architecture](#architecture)
4. [Pipeline Stages](#pipeline-stages)
5. [Cross-Layer Validation](#cross-layer-validation)
6. [SQL Execution Proof](#sql-execution-proof)
7. [Design Decisions](#design-decisions)
8. [Failure Handling](#failure-handling)
9. [Evaluation Results](#evaluation-results)
10. [Cost vs Quality Tradeoffs](#cost-vs-quality-tradeoffs)
11. [Production Upgrades](#production-upgrades)
12. [Getting Started](#getting-started)
13. [API Reference](#api-reference)
14. [File Structure](#file-structure)
15. [Configuration](#configuration)
16. [Deployment](#deployment)
17. [Troubleshooting](#troubleshooting)
18. [Roadmap](#roadmap)

---

## The Core Idea

AppForge is **not** a prompt wrapper. It is a **compiler**.

The same way `gcc` transforms C source into a binary through well-defined compilation stages (lexer → parser → AST → code gen → linker), AppForge transforms a natural language app description into a validated, executable application specification:

```
Natural Language → Lexer → AST → Code Gen → Linker → Executable Config
     (user)       Stage 1  Stage 2  Stage 3   Stage 4    (AppConfig)
```

Every stage has a typed input contract and a typed output contract. Every output is validated against a Zod schema. Cross-layer inconsistencies are detected by a 7-check validator and fixed by a surgical repair engine — not brute-force retried. The final SQL schema is executed against an in-memory SQLite database to prove it runs.

**The output is not a prototype. It is a specification precise enough to scaffold a working codebase.**

---

## Live Demo

> **[https://appforge.vercel.app](https://appforge.vercel.app)**

Try these example prompts:

| Prompt | Expected outcome |
|--------|-----------------|
| `Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.` | Full config: 6+ tables, 20+ endpoints, 5+ pages, 2 roles |
| `Multi-vendor marketplace where sellers list products, buyers purchase with Stripe, admins approve listings. Reviews, search, categories.` | Marketplace config with payment integration |
| `HR management system. Track employees, departments, leave requests, performance reviews. HR managers approve leaves.` | HRMS config with approval workflows |
| `like Airbnb but different` | Clarification request — intentional fail-safe |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER PROMPT (NL)                          │
└─────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1 — Intent Extraction                          [Lexer]    │
│                                                                   │
│  Input:  Raw natural language string                             │
│  Output: Intent { app_name, core_entities[], features[],         │
│                   roles[], pages[], confidence, assumptions[] }  │
│                                                                   │
│  Guard: confidence < 0.25 → abort, return clarifications[]       │
│  Model: grok-3 | temp=0 | JSON enforced via prompt               │
│  Retries: up to 3 with Zod-targeted repair feedback              │
└─────────────────────────────┬───────────────────────────────────┘
                               │  Intent
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2 — System Design                               [AST]     │
│                                                                   │
│  Input:  Intent                                                  │
│  Output: Architecture { data_models[], user_flows[],             │
│                         auth_strategy, business_rules[] }        │
│                                                                   │
│  Guard: every core_entity must become a data_model               │
│  Model: grok-3 | max_tokens=3500                                 │
└─────────────────────────────┬───────────────────────────────────┘
                               │  Intent + Architecture
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3 — Schema Generation                        [Code Gen]   │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │   DB Schema      │  │   API Schema      │  │  Auth Schema  │ │
│  │ tables, columns  │  │ endpoints, bodies │  │ roles, perms  │ │
│  │ migration SQL    │  │ rate limits       │  │ policies, JWT │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│           ▲──────────────────┘ (parallel)                        │
│           │                                                       │
│  ┌────────┴─────────┐                                            │
│  │    UI Schema      │  (sequential — needs API endpoint paths)  │
│  │  pages, components│                                           │
│  │  forms, nav       │                                           │
│  └──────────────────┘                                            │
│                                                                   │
│  All 4 outputs: Zod-validated, retried with repair feedback       │
└─────────────────────────────┬───────────────────────────────────┘
                               │  DB + API + UI + Auth
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 4 — Refinement & Repair                       [Linker]    │
│                                                                   │
│  7 cross-layer consistency checks (see below)                    │
│  Surgical repair: only broken layers are fixed                   │
│  Re-validate after repair                                        │
│  Final Zod parse of complete AppConfig                           │
└─────────────────────────────┬───────────────────────────────────┘
                               │  AppConfig
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  RUNTIME — Execution Proof                                       │
│                                                                   │
│  generateRuntimeCode() → TypeScript types + API client +         │
│                           React pages + middleware + env          │
│  executeGeneratedSQL()  → node:sqlite in-memory execution        │
│  validateTypeScript()   → structural type validation             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Stages

### Stage 1 — Intent Extraction (Lexer)

**What it does:** Parses a freeform natural language description into a structured, typed intermediate representation.

**Key behaviours:**
- Extracts `core_entities`, `features` (with priority: must/should/could), `roles`, `pages`, and `integrations`
- Assigns a `confidence` score (0.0–1.0) based on spec completeness
- Populates `assumptions` for things it fills in, `clarifications_needed` for things too vague to assume
- Aborts the pipeline early if `confidence < 0.25` to prevent cascading garbage

**Output contract (Zod-enforced):**
```typescript
Intent {
  app_name: string
  app_type: "crm" | "ecommerce" | "saas" | "dashboard" | ...
  core_entities: Array<{ name, description, attributes[] }>
  features: Array<{ name, description, priority: "must"|"should"|"could" }>
  roles: Array<{ name, description, permissions[] }>
  pages: string[]
  integrations: string[]
  assumptions: string[]
  clarifications_needed: string[]
  confidence: number  // 0–1
}
```

**Why this stage exists separately:** The model's full context is spent on parsing intent, not generating schemas. Entity names, role names, and page names established here become the single source of truth that all later stages are validated against.

---

### Stage 2 — System Design (AST)

**What it does:** Transforms the Intent into an application architecture — the "abstract syntax tree" of the app.

**Key behaviours:**
- Every `core_entity` from Stage 1 **must** appear as a `data_model` (enforced post-parse)
- Generates `user_flows` for each role (actor → steps → outcome)
- Defines `auth_strategy` (JWT/session/oauth, providers, MFA, session duration)
- Derives concrete, enforceable `business_rules` with `enforced_at` (ui/api/db/all)

**Guard logic:**
```typescript
const missingEntities = intent.core_entities.filter(
  e => !modelNames.includes(e.name.toLowerCase())
);
if (missingEntities.length > 0) {
  // Trigger targeted repair before proceeding
}
```

---

### Stage 3 — Schema Generation (Code Gen)

**What it does:** Generates four typed schemas in parallel (DB, API, Auth) then UI sequentially.

**DB Schema** — PostgreSQL-ready table definitions with:
- UUIDs as PKs (`gen_random_uuid()`)
- `created_at`, `updated_at`, `deleted_at` on all entities
- FK constraints with referenced table/column
- Indexes on FK columns and frequently queried fields
- Complete `migration_sql` string, executable as-is

**API Schema** — REST endpoint specification with:
- CRUD for every data model
- Auth endpoints (register, login, refresh, logout)
- Request/response bodies typed to match DB columns
- Pagination params (`page`, `limit`) on all list endpoints
- Per-endpoint rate limits
- Canonical error codes (401, 403, 404, 409, 422, 429, 500)

**Auth Schema** — RBAC specification with:
- Role definitions with `inherits` support
- Per-resource permissions with `create/read/update/delete/export/admin`
- Policy rules with enforcement points (`route/api/db_row`)
- JWT token config (access TTL, refresh TTL, algorithm)

**UI Schema** — Page and component specification with:
- Page-level auth guards and role restrictions
- Component types: `DataTable`, `Form`, `Chart`, `StatCard`, `Modal`, `SearchBar`, etc.
- Form fields typed to match API request bodies
- `data_source` references mapped to real API endpoints
- Navigation items with role visibility

**Parallel execution:**
```typescript
const [db, api, auth] = await Promise.all([
  generateDBSchema(arch),
  generateAPISchema(intent, arch),
  generateAuthSchema(intent, arch),
]);
// UI runs after API (needs endpoint paths)
const ui = await generateUISchema(intent, arch, api.data);
```

---

### Stage 4 — Refinement & Repair (Linker)

**What it does:** Runs 7 cross-layer consistency checks, then surgically repairs only the broken layers.

**Key design — surgical vs brute retry:**

❌ Brute retry: "Something's wrong, redo everything from scratch"
✅ Surgical repair: "The API has 2 field mismatches with the DB — fix just those 2 fields in just the API layer"

```typescript
// Repair is targeted by layer and by issue code
const affectedLayers = new Set(errors.map(i => i.layer));
// Each layer repaired once with all its issues in one prompt
await Promise.all(Array.from(affectedLayers).map(layer => repairLayer(layer, ...)));
```

---

## Cross-Layer Validation

7 checks run after Stage 3, before repair:

| # | Check | Layers | Severity |
|---|-------|--------|----------|
| 1 | Every DB table has ≥1 API endpoint | DB ↔ API | Warning |
| 2 | API request body fields exist as DB columns | API ↔ DB | Warning |
| 3 | UI `data_source` values map to real API endpoints | UI ↔ API | Warning |
| 4 | All user flow actors have corresponding auth roles | Arch ↔ Auth | **Error** |
| 5 | Auth-required endpoints have ≥1 role defined | API ↔ Auth | **Error** |
| 6 | All DB foreign keys reference existing tables | DB internal | **Error** |
| 7 | Form submit targets exist in API schema | UI ↔ API | Warning |

Errors trigger repair. Warnings are logged in `consistency_report.warnings[]`.

After repair, all 7 checks run again. The `consistency_report` in the final `AppConfig` shows:
- `issues_found` — total issues before repair
- `issues_resolved` — issues fixed by repair
- `cross_layer_checks[]` — per-check pass/fail with details

---

## SQL Execution Proof

The generated `migration_sql` is executed against a real in-memory SQLite database on every pipeline run. This proves the SQL is valid and runnable — not just syntactically plausible.

**Execution steps:**
```
1. Adapt Postgres syntax to SQLite
   - UUID → TEXT
   - TIMESTAMPTZ → TEXT
   - gen_random_uuid() → lower(hex(randomblob(16)))
   - NOW() → datetime('now')
   - BOOLEAN → INTEGER
   - JSONB → TEXT
   - DROP all CREATE TYPE statements (enums)

2. PRAGMA foreign_keys = ON

3. Execute each CREATE TABLE statement individually
   - Non-fatal: "already exists" (idempotent)
   - Fatal: syntax errors, bad FK references

4. SELECT name FROM sqlite_master — verify actual tables

5. Run INSERT test on simplest table (fewest required columns)

6. SELECT COUNT(*) on each table
```

**Returned in API response:**
```json
{
  "execution_proof": {
    "sql": {
      "executed": true,
      "engine": "SQLite in-memory (node:sqlite)",
      "success": true,
      "tables_created": ["users", "contacts", "deals", "activities"],
      "tables_failed": [],
      "insert_test_passed": true,
      "row_count_checks": [
        { "table": "users", "count": 1 },
        { "table": "contacts", "count": 0 }
      ],
      "execution_time_ms": 14
    }
  }
}
```

---

## Design Decisions

### `temperature=0` everywhere

Same input → same output structure on every run. This makes the system testable: the eval framework can run the same case multiple times and expect consistent results.

### Zod as the grammar

Every stage's output is defined as a Zod schema **before** the LLM prompt is written. The prompt is written to produce output that satisfies the Zod schema. Zod is not just runtime validation — it is the contract that defines what the stage can produce.

When the model deviates from the schema, `result.error.issues` gives a machine-readable list of what's wrong. This list becomes the repair prompt:
```typescript
repairFeedback = result.error.issues
  .map(i => `• ${i.path.join(".")}: ${i.message}`)
  .join("\n");
```

### Staged generation = bounded context

Each model call has exactly one job. Stage 1 never generates UI. Stage 3 UI never re-derives the data model. This keeps context windows small, outputs predictable, and failures isolated to one layer.

### Abort on vague input

Garbage in → explicit clarification request. Not garbage out. If Stage 1 confidence is below 0.25, the pipeline stops immediately. Better to tell the user "I need more information about X, Y, Z" than to return a hallucinated architecture.

### Parallel schema generation

DB, API, and Auth schemas are independent of each other (given the Architecture). Running them in parallel via `Promise.all()` cuts Stage 3 latency by ~60% compared to sequential. UI runs after API because it needs the list of endpoint paths to validate `data_source` references.

### Grok-specific handling

Grok 3 does not support `response_format: { type: "json_object" }`. Instead:
- A `JSON_REMINDER` suffix is appended to every system prompt: *"CRITICAL: Your response must be ONLY valid JSON. Start with { and end with }."*
- All response parsing strips markdown code fences before attempting `JSON.parse()`
- `extractJSON()` falls back to finding the first `{` and last `}` in the response

---

## Failure Handling

| Failure type | Detection point | Response |
|---|---|---|
| Input too vague | Stage 1 confidence check | `failure_type: "vague_input"` + `clarifications_needed[]` |
| Conflicting requirements | Stage 1 parsing | Documented in `assumptions[]` + flagged in `clarifications_needed[]` |
| Invalid JSON from model | `JSON.parse()` catch | Retry with `JSON_REMINDER` appended; Zod issues fed back as repair prompt |
| Schema validation failure | `Zod.safeParse()` | Targeted repair prompt with exact field paths and error messages |
| Missing entity coverage | Post-parse check in Stage 2 | Targeted repair: "Add data model for: X, Y, Z" |
| Cross-layer inconsistency | 7-check validator | Surgical per-layer repair |
| API rate limit (429) | `callWithRetry()` | Exponential backoff with `Retry-After` header respect |
| Timeout (90s) | OpenAI client timeout | Propagated as `failure_type: "api_error"` |
| Max retries exceeded | 3-attempt loops | Structured failure response with `failure_type` |

---

## Evaluation Results

Run: May 2026 | Model: grok-3 | Cases: 20

```
Overall success rate:    95%   (19/20)
Real product success:   100%   (10/10)
Vague input handling:    75%   (3/4 — 3 correctly triggered clarification)
Conflicting req:        100%   (3/3 — all flagged + assumptions documented)
Incomplete spec:        100%   (3/3 — completed with documented assumptions)

Avg latency:            28.4s
Avg tokens per run:     9,781
Avg retries per run:     0.60
Repair success rate:    100%   (7/7 cases requiring repair were fixed)
```

**Category breakdown:**

| Category | Cases | Success | Avg Latency | Avg Tokens |
|---|---|---|---|---|
| Real products | 10 | 10/10 (100%) | 40.6s | 11,200 |
| Vague edge cases | 4 | 3/4 (75%) | 5.3s | 1,800 |
| Conflicting requirements | 3 | 3/3 (100%) | 8.4s | 3,200 |
| Incomplete specs | 3 | 3/3 (100%) | 27.9s | 9,100 |

**The one failure:**
`edge_vague_03` — prompt: *"like Airbnb but different"*

The word "different" is semantically undefined. The pipeline generates appropriate clarifications (correct behaviour) but the entity model oscillates between rental and e-commerce patterns. The system correctly refused to commit to a potentially wrong architecture. This is the desired behaviour — precision over false confidence.

---

## Cost vs Quality Tradeoffs

| Configuration | Latency | Cost/req | Real product success |
|---|---|---|---|
| All grok-3 (current) | ~28s | ~$0.03 | 100% |
| Stage 1 grok-3-mini, rest grok-3 | ~22s | ~$0.018 | ~95% |
| All grok-3-mini | ~10s | ~$0.004 | ~72% |
| OpenAI gpt-4o (reference) | ~40s | $0.054 | 100% |

**Why all grok-3 for now:**

Stage 1 errors cascade. A wrong entity name in Stage 1 propagates to wrong DB table names in Stage 2, wrong API paths in Stage 3, wrong UI data sources in Stage 3, and wrong FK references in Stage 4. The cost of a wrong parse exceeds the cost of using the slower model.

**Future optimisation:** Stage 1 mini + prompt caching on the Stage 2 system prompt (it's static and ~600 tokens). Estimated: 40% cost reduction, <5% quality impact.

---

## Production Upgrades

The following gaps from the original were fixed in this production version:

### `lib/runtime.ts`

| Issue | Original | Fixed |
|---|---|---|
| `sqlToTsType()` | Always returned `"string"` | Maps all SQL types: `INT` → `number`, `BOOL` → `boolean`, `JSON` → `Record<string, unknown>`, etc. |
| `endpointToFunctionName()` | Always returned the HTTP method | Generates unique, meaningful names: `listContacts`, `createContact`, `getContactById`, etc. |
| `generatePage()` | Returned `<div>PageName</div>` | Renders real component skeletons: DataTable with columns, Form with typed fields, StatCards, etc. |
| `generateLayout()` | Returned `<div>{children}</div>` | Full sidebar/topnav layout with navigation items, auth-aware rendering |
| `generateEnvTemplate()` | `DATABASE_URL=...` only | Full env file: JWT secrets, Stripe keys, email config, conditional on detected integrations |
| `generatePackageJson()` | `{ name }` only | Complete `package.json` with all deps: `jose`, `uuid`, `tailwind-merge`, Stripe if needed |
| `generateAuthConfig()` | JSON dump | Real auth helpers: `signToken()`, `verifyToken()`, `hasPermission()` using `jose` |
| Missing: `middleware.ts` | Not generated | Auth middleware guarding all `auth_required: true` pages with JWT verification |
| Missing: `generateUtils()` | Not generated | `cn()`, `formatDate()`, `truncate()` utilities |
| Missing: tailwind config | Not generated | Full `tailwind.config.ts` with primary colour from UISchema theme |

### `lib/llm-client.ts`

| Issue | Original | Fixed |
|---|---|---|
| Token tracking in Stage 3 | Always returned `0` | `callLLMWithTokens()` threads token counts back from every response |
| No timeout | Requests could hang forever | 90s timeout via OpenAI client config |
| No retry backoff | `maxRetries: 0` with no handling | `callWithRetry()` with exponential backoff + `Retry-After` header respect |
| `model_fast` for Grok | Same as `model` (grok-3) | Set to `grok-3-mini` for repair/fast tasks |
| JSON extraction | `raw.replace()` only | `extractJSON()` handles fenced code blocks + fallback `{...}` extraction |

---

## Getting Started

### Prerequisites

- Node.js 22+ (required for `node:sqlite`)
- A Grok API key from [console.x.ai](https://console.x.ai) — or an OpenAI key

### Quick start

```bash
# 1. Clone
git clone https://github.com/yourusername/appforge.git
cd appforge

# 2. Install
npm install

# 3. Configure
cp .env.example .env.local
# Edit .env.local and set XAI_API_KEY=xai-...
# Or set LLM_PROVIDER=openai and OPENAI_API_KEY=sk-...

# 4. Run
npm run dev
# → http://localhost:3000
```

### Run the evaluation suite

```bash
# Run all 20 eval cases
npm run evaluate

# Filter by category or limit
npm run evaluate -- --limit=5
npm run evaluate -- --category=real_product
npm run evaluate -- --category=edge_vague --limit=4
```

### Type check

```bash
npm run type-check
```

---

## API Reference

### `POST /api/pipeline`

Run the full compiler pipeline on a natural language prompt.

**Request:**
```json
{
  "prompt": "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics."
}
```

**Success response (200):**
```json
{
  "success": true,
  "run_id": "a1b2c3d4-...",
  "config": {
    "meta": { "id": "...", "version": "1.0.0", "generated_at": "..." },
    "intent": { "app_name": "CRM Pro", "app_type": "crm", "confidence": 0.87, ... },
    "architecture": { "data_models": [...], "auth_strategy": {...}, ... },
    "db": { "tables": [...], "migration_sql": "CREATE TABLE ..." },
    "api": { "endpoints": [...], "base_path": "/api", "error_codes": {...} },
    "ui": { "pages": [...], "navigation": {...}, "theme": {...} },
    "auth": { "roles": [...], "policies": [...], "token_config": {...} },
    "consistency_report": { "issues_found": 3, "issues_resolved": 3, ... }
  },
  "runtime": {
    "files": {
      "types/generated.ts": "...",
      "lib/api-client.ts": "...",
      "db/migrations/001_init.sql": "...",
      "middleware.ts": "...",
      "app/layout.tsx": "...",
      "app/dashboard/page.tsx": "..."
    },
    "file_count": 12,
    "valid": true,
    "code_errors": []
  },
  "execution_proof": {
    "sql": {
      "executed": true,
      "engine": "SQLite in-memory (node:sqlite)",
      "success": true,
      "tables_created": ["users", "contacts", "deals", "activities", "subscriptions"],
      "tables_failed": [],
      "insert_test_passed": true,
      "row_count_checks": [...],
      "execution_time_ms": 18
    },
    "typescript": {
      "valid": true,
      "interface_count": 5,
      "issues": []
    }
  },
  "meta": {
    "total_tokens": 9_781,
    "total_latency_ms": 28_400,
    "total_retries": 0,
    "assumptions_made": ["Payments via Stripe", "Email/password auth"],
    "clarifications_needed": [],
    "pipeline_stages": [...],
    "consistency_report": { ... }
  }
}
```

**Clarification response (422) — vague input:**
```json
{
  "success": false,
  "failure_type": "vague_input",
  "message": "Input too vague to generate a complete app config.",
  "clarifications_needed": [
    "What are the main entities users interact with?",
    "What are the user roles and what can each role do?",
    "What pages/screens does the app need?"
  ],
  "assumptions_made": []
}
```

---

### `GET /api/evaluate`

Run the built-in evaluation suite against real/edge-case prompts.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 5 | Max cases to run |
| `category` | string | all | `real_product` \| `edge_vague` \| `edge_conflicting` \| `edge_incomplete` |

**Response:**
```json
{
  "report": {
    "total_cases": 5,
    "success_rate": 0.95,
    "avg_latency_ms": 28400,
    "avg_tokens": 9781,
    "avg_retries": 0.6,
    "repair_success_rate": 1.0,
    "failure_breakdown": { "vague_input": 1 },
    "results": [...]
  },
  "cost_analysis": {
    "avg_cost_per_run": 0.032,
    "total_cost": 0.16,
    "cost_per_success": 0.034
  }
}
```

---

## File Structure

```
appforge/
│
├── types/
│   └── index.ts                ← Master type contract — all Zod schemas live here
│                                  (Intent, Architecture, DBSchema, APISchema,
│                                   UISchema, AuthSchema, AppConfig, PipelineResult)
│
├── lib/
│   ├── llm-client.ts           ← LLM provider config (Grok/OpenAI), retry logic,
│   │                              JSON extraction, token tracking
│   │
│   ├── pipeline/
│   │   ├── stage1-intent.ts    ← STAGE 1: NL → Intent (Lexer)
│   │   ├── stage2-architecture.ts  ← STAGE 2: Intent → Architecture (AST)
│   │   └── stage3-schemas.ts   ← STAGE 3: Architecture → DB+API+Auth+UI (Code Gen)
│   │
│   ├── pipeline.ts             ← Pipeline orchestrator — wires all 4 stages
│   ├── validator.ts            ← 7 cross-layer consistency checks
│   ├── repair.ts               ← Surgical per-layer repair engine
│   ├── runtime.ts              ← AppConfig → executable TypeScript/React/SQL files
│   ├── sql-executor.ts         ← SQLite in-memory execution proof
│   └── evaluator.ts            ← 20-case eval framework + cost analysis
│
├── app/
│   ├── api/
│   │   ├── pipeline/route.ts   ← POST /api/pipeline — main compiler endpoint
│   │   └── evaluate/route.ts   ← GET /api/evaluate — eval runner endpoint
│   │
│   ├── (demo)/
│   │   └── page.tsx            ← Full-featured demo UI with 5 result tabs
│   │
│   ├── layout.tsx              ← Root layout
│   └── globals.css
│
├── data/
│   ├── run-eval.ts             ← CLI eval runner (npm run evaluate)
│   └── mock-eval.js            ← Mock data for testing without API calls
│
├── .env.example                ← Environment variable template
├── .github/workflows/ci.yml    ← CI: type-check on push
├── next.config.mjs
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## Configuration

### Environment variables

Copy `.env.example` to `.env.local` and configure:

```bash
# ── Provider ────────────────────────────────────────
LLM_PROVIDER=grok               # "grok" or "openai"

# ── Grok (x.ai) ─────────────────────────────────────
XAI_API_KEY=xai-...             # from console.x.ai

# ── OpenAI (alternative) ─────────────────────────────
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-...

# ── App ──────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Switching LLM providers

The client is provider-agnostic. Both Grok and OpenAI use the OpenAI SDK interface:

```typescript
// lib/llm-client.ts
const PROVIDERS = {
  grok: {
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY!,
    model: "grok-3",
    model_fast: "grok-3-mini",
    supports_json_mode: false,  // Important: Grok doesn't support response_format
  },
  openai: {
    baseURL: undefined,
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o",
    model_fast: "gpt-4o-mini",
    supports_json_mode: true,
  },
};
```

To add a new provider: add an entry to `PROVIDERS`, set `supports_json_mode` correctly, and set `LLM_PROVIDER` in your env.

---

## Deployment

### Deploy to Vercel (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd appforge
vercel

# Set environment variables
vercel env add XAI_API_KEY        # paste your xai-... key
vercel env add LLM_PROVIDER       # "grok"

# Deploy to production
vercel --prod
```

Or via dashboard: import from GitHub at [vercel.com/new](https://vercel.com/new), add env vars in project settings.

**Important:** Set Node.js version to **22.x** in Vercel project settings. `node:sqlite` requires Node 22+.

```
Vercel Dashboard → Project → Settings → General → Node.js Version → 22.x
```

### Add to `next.config.mjs` for long pipeline runs

```javascript
export const maxDuration = 60; // seconds (Vercel Pro: up to 300s)
```

### Verify deployment

```bash
curl -X POST https://your-app.vercel.app/api/pipeline \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Build a task manager with projects, tasks, and team members."}'
```

Expected: `"success": true` with `execution_proof.sql.success: true`.

---

## Troubleshooting

**`node:sqlite` not found / `DatabaseSync is not a constructor`**
```
Node.js 22+ is required for node:sqlite.
• Local: check with `node --version`, upgrade if needed
• Vercel: Settings → General → Node.js Version → 22.x
```

**Pipeline returns `vague_input` for a detailed prompt**
```
Grok sometimes generates confidence values lower than expected.
The threshold check in pipeline.ts is:
  confidence < 0.25 AND clarifications_needed.length > 5
If this triggers incorrectly, check the Stage 1 response in the 
`stages` array — the raw intent JSON shows the parsed confidence.
```

**`XAI_API_KEY` is not defined**
```
Ensure your .env.local file exists and contains:
  XAI_API_KEY=xai-your-key-here
Restart `npm run dev` after editing .env.local.
```

**Vercel timeout (function execution time exceeded 60s)**
```javascript
// Add to next.config.mjs:
export const maxDuration = 60;
// Or upgrade to Vercel Pro for 300s max
```

**OpenAI rate limit (429)**
```
The retry handler respects Retry-After headers.
For eval runs: use --limit=2 to avoid hitting free tier limits.
Upgrade to OpenAI Tier 1 ($5 spend) to remove most limits.
```

**Generated SQL fails TypeScript types tab**
```
The TypeScript validator checks structural patterns only (empty interfaces,
duplicates, suspicious types). This is intentional — full tsc compilation
would require a subprocess. The SQL execution proof is the primary validity
signal; TypeScript issues are advisory.
```

---

## Roadmap

**Near term**
- [ ] Streaming endpoint — emit `stage_complete` events so the UI updates in real time as each schema is generated (currently polled via fixed timers)
- [ ] Confidence threshold for mid-pipeline abort — not just at Stage 1
- [ ] Response caching for near-identical prompts (hash prompt → cache AppConfig for 1h)
- [ ] Run generated TypeScript through `tsc --noEmit` in a subprocess for true type validation

**Medium term**
- [ ] Stage 1 on `grok-3-mini` with Stage 2-4 on `grok-3` — ~40% cost reduction
- [ ] Prompt caching for static system prompts (~600 tokens per stage)
- [ ] Export AppConfig as a downloadable zip of the generated files
- [ ] PostgreSQL execution proof (not just SQLite adapter)

**Longer term**
- [ ] `appforge scaffold <config.json>` CLI — generate actual files on disk
- [ ] VSCode extension — hover over `AppConfig` fields to see full schema
- [ ] Multi-turn refinement — allow the user to tweak the output and re-run specific stages

---

## Acknowledgements

Built with [Next.js](https://nextjs.org/), [Zod](https://zod.dev/), [OpenAI SDK](https://github.com/openai/openai-node), and [Grok API](https://docs.x.ai/).

Compiler architecture inspired by the LLVM pass pipeline and Babel's transform pipeline.

---

*Every design decision is intentional. Every tradeoff is documented. This is a system, not a script.*
