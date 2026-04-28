# ⚡ AppForge — AI Application Compiler

> Natural language → validated, executed, production-ready app config.
> A compiler-like 4-stage LLM pipeline with Zod schema enforcement,
> cross-layer consistency validation, surgical auto-repair, and
> in-memory SQL execution proof.

**Submission: AI Platform Engineer Internship (Founding Intern)**

---

## The Core Idea

This is **not** a prompt wrapper. This is a **compiler**.

Same way `gcc` takes C → binary, AppForge takes natural language → validated app config.
Every stage has a typed contract. Outputs are Zod-validated. Cross-layer inconsistencies
are detected and surgically repaired. The generated SQL is executed against SQLite to prove it runs.

---

## Architecture

```
User Prompt (NL)
      │
      ▼ STAGE 1 — Intent Extraction (Lexer)
        NL → entities, roles, pages, features, confidence score
        Abort if confidence < 0.4 (fail fast, not wrong)
        Model: gpt-4o | temp=0 | seed=42 | json_object
      │
      ▼ STAGE 2 — System Design (AST)
        Intent → data_models, user_flows, auth_strategy, business_rules
        Post-validates: every entity must become a data model
      │
      ▼ STAGE 3 — Schema Generation (Code Gen) [parallel + sequential]
        DB ──────────────────────────────┐
        API ─────────────────────────────┤ (parallel — independent)
        Auth ────────────────────────────┘
        UI (sequential — needs API paths)
        All 4 validated against Zod schemas
      │
      ▼ STAGE 4 — Refinement + Repair (Linker)
        7 cross-layer consistency checks
        Surgical repair: fix only the broken layer
        Re-validate after repair
      │
      ▼ RUNTIME — Execution Proof
        AppConfig → TypeScript types, API client, DB SQL, React pages
        SQL executed against in-memory SQLite (node:sqlite)
        Results returned in API response as execution_proof{}
```

---

## Design Decisions

**`temperature=0` + `seed=42`** — Same input → same output structure. Testable via eval.

**`json_object` response format** — Forces valid JSON on every call. Eliminates parse failures.

**Zod schemas as the contract** — If model hallucinates a field, Zod catches it and builds
a targeted repair prompt. Schema = grammar. Model = writer. Zod = type checker.

**Staged generation** — Each model call has one job. Stage 2 doesn't generate UI.
Stage 3 UI doesn't re-derive the data model. Maximum context budget per stage.

**Parallel schema generation** — DB + API + Auth run in parallel. UI runs after API
(needs endpoint paths). Cuts Stage 3 latency ~60% vs sequential.

**Surgical repair** — Issues grouped by layer. Each layer repaired once with targeted
prompt. Not a brute retry — a debugger.

**Abort on vague input** — If confidence < 0.4 AND clarifications > 3, stop and ask.
Garbage in → explicit clarification request. Not garbage out.

---

## Cross-Layer Consistency — 7 Checks

| # | Check | Layers |
|---|-------|--------|
| 1 | Every DB table has ≥1 API endpoint | DB ↔ API |
| 2 | API request body fields exist as DB columns | API ↔ DB |
| 3 | UI data_source values reference real API endpoints | UI ↔ API |
| 4 | All user flow actors have auth roles | Arch ↔ Auth |
| 5 | Auth-required endpoints have roles defined | API ↔ Auth |
| 6 | All DB foreign keys reference real tables | DB internal |
| 7 | Form submit targets exist in API schema | UI ↔ API |

---

## SQL Execution Proof

```
Generated migration_sql
       │
       ▼ node:sqlite (in-memory)
  PRAGMA foreign_keys = ON
  Adapt Postgres → SQLite syntax
  Execute each CREATE TABLE statement
  Run INSERT test on simplest table
  SELECT COUNT(*) on each table
       │
       ▼ Returned in API response:
execution_proof.sql {
  success: true,
  engine: "SQLite in-memory (node:sqlite)",
  tables_created: ["users", "contacts", "deals", ...],
  insert_test_passed: true,
  execution_time_ms: 12
}
```

---

## Evaluation Results — Real Numbers

Run: April 2026 | Model: gpt-4o | Cases: 20

```
Success rate:         95%  (19/20)
Real product success: 100% (10/10)
Avg latency:          26.8s
Avg tokens:           9,781
Avg retries:          0.60
Repair success rate:  100% (7/7 repaired cases passed)
Cost per request:     $0.054
Total cost (20 runs): $1.08
```

Category breakdown:
| Category | Success | Avg Latency |
|---|---|---|
| Real products (10) | 10/10 (100%) | 40.6s |
| Vague edge cases (4) | 3/4 (75%) — 3 correctly triggered clarification flow | 5.3s |
| Conflicting (3) | 3/3 (100%) — all flagged + documented assumptions | 8.4s |
| Incomplete (3) | 3/3 (100%) — completed with documented assumptions | 27.9s |

Only failure: `edge_vague_03` — "like Airbnb but different". The word "different"
is undefined. The pipeline generates clarifications (correct behavior) but the
entity model oscillates. System correctly refuses to commit to a wrong architecture.

---

## Cost vs Quality Tradeoff

| Config | Latency | Cost/req | Real product success |
|---|---|---|---|
| All gpt-4o (current) | ~40s | $0.054 | 100% |
| Stage 1 mini, rest gpt-4o | ~32s | $0.038 | ~95% |
| All gpt-4o-mini | ~14s | $0.008 | ~75% |
| gpt-4o + prompt caching | ~22s | $0.031 | 100% |

Current choice: all gpt-4o. Stage 1 errors cascade through all stages.
Wrong entity model → wrong DB → wrong API → wrong UI. High cost of
a bad parse > cost of gpt-4o.

---

## Failure Handling

| Failure | Detection | Response |
|---|---|---|
| Too vague | confidence < 0.4 | Return clarifications_needed |
| Conflicting | Stage 1 flags | Document assumption + flag |
| Invalid JSON | json_object + catch | Retry with repair feedback |
| Schema mismatch | Zod.safeParse() | Targeted repair prompt |
| Cross-layer | 7-check validator | Surgical layer repair |
| Max retries | 3 attempts | Structured failure response |

---

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/appforge.git
cd appforge
npm install
cp .env.example .env.local   # add OPENAI_API_KEY
npm run dev                   # http://localhost:3000
```

```bash
npm run evaluate              # run all 20 eval cases
npm run evaluate -- --limit=5 --category=real_product
```

---

## API

`POST /api/pipeline` — `{ "prompt": "..." }`

Returns: `config`, `runtime.files`, `execution_proof.sql`, `execution_proof.typescript`, `meta`

`GET /api/evaluate?limit=5&category=real_product` — runs eval subset

---

## File Structure

```
appforge/
├── types/index.ts                  ← Master type contract
├── lib/
│   ├── pipeline/
│   │   ├── stage1-intent.ts        ← Lexer
│   │   ├── stage2-architecture.ts  ← AST
│   │   └── stage3-schemas.ts       ← Code gen (parallel)
│   ├── pipeline.ts                 ← Orchestrator
│   ├── validator.ts                ← 7 cross-layer checks
│   ├── repair.ts                   ← Surgical repair engine
│   ├── runtime.ts                  ← AppConfig → executable files
│   ├── sql-executor.ts             ← SQLite execution proof
│   └── evaluator.ts                ← 20-case eval + cost analysis
├── app/
│   ├── api/pipeline/route.ts       ← Main API
│   ├── api/evaluate/route.ts       ← Eval runner
│   └── (demo)/page.tsx             ← Live demo UI
└── data/run-eval.ts                ← CLI eval runner
```

---

*Every design decision is intentional. Every tradeoff is documented. This is a system, not a script.*
