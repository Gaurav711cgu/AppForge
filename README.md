# ⚡ AppForge — AI Application Compiler

> **Natural Language → Validated, Executable App Config**  
> A true **compiler-like** 4-stage LLM pipeline with strict Zod schemas, cross-layer consistency validation, surgical auto-repair, and in-memory SQL execution proof.

![AppForge Demo](https://via.placeholder.com/800x400/6366f1/ffffff?text=AppForge+Demo)  
*(Add a real screenshot/GIF here after deployment)*

## ✨ Why AppForge?

Most "AI app builders" are just fancy prompt wrappers.  
**AppForge is different** — it treats app generation like compilation:

- Typed contracts between every stage (Zod)
- Fail-fast on vague input
- 7 cross-layer consistency checks
- Surgical repair (only fix broken layers)
- Real SQL execution proof using `node:sqlite`
- Full evaluation framework with real product + edge cases

## Architecture
User Prompt (NL)
↓
Stage 1 — Intent Extraction (Lexer)
↓
Stage 2 — System Architecture (AST)
↓
Stage 3 — Schema Generation (Parallel: DB + API + Auth → UI)
↓
Stage 4 — Validation + Surgical Repair (Linker)
↓
Runtime — Execution Proof (SQL + TypeScript generation)
text**Key Design Decisions**:
- `temperature=0` + `seed=42` → deterministic outputs
- `json_object` mode + Zod validation → no hallucinated fields
- Parallel schema generation (Stage 3) for speed
- Surgical repair instead of brute-force retry
- In-memory SQLite execution to prove generated SQL is valid

## Features

- ✅ 4-stage structured pipeline
- ✅ Full Zod schema validation on every layer
- ✅ 7 cross-layer consistency checks
- ✅ Surgical per-layer repair engine
- ✅ Real SQL execution proof (`node:sqlite`)
- ✅ Rich React demo UI with live pipeline visualization
- ✅ Comprehensive 20-case evaluation framework
- ✅ Multi-LLM support (OpenAI / Groq / Grok)

## 🚀 Quick Start

git clone https://github.com/YOUR_USERNAME/appforge.git
cd appforge

cp .env.example .env.local
# Add your LLM key (OPENAI_API_KEY or GROQ_API_KEY)

npm install
npm run dev
Open http://localhost:3000 and try:
"Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics."
📊 Evaluation Results
Run: April 2026 | 20 cases | gpt-4o

MetricResultSuccess Rate95% (19/20)Real Product Success100% (10/10)Repair Success Rate100% (7/7)Avg Latency26.8sAvg Cost per Request$0.054
Only failure: Extremely vague "like Airbnb but different" prompt — correctly triggered clarification flow.
🛠 Tech Stack

Framework: Next.js 14 (App Router)
Language: TypeScript
Validation: Zod
LLM: OpenAI / Groq / xAI Grok
Database Proof: node:sqlite
Styling: Tailwind CSS

📁 Project Structure
Bashappforge/
├── app/                    # Next.js app
│   ├── (demo)/page.tsx     # Beautiful live demo
│   └── api/pipeline/...    # Main compiler API
├── lib/
│   ├── pipeline/           # 4-stage compiler
│   ├── validator.ts        # 7 consistency checks
│   ├── repair.ts           # Surgical repair
│   ├── sql-executor.ts     # Execution proof
│   └── evaluator.ts        # Eval framework
├── types/index.ts          # Master type contracts
├── data/run-eval.ts        # CLI evaluation
└── DEPLOY.md               # Deployment guide
API
POST /api/pipeline
JSON{
  "prompt": "Build a SaaS learning platform..."
}
Returns full config + runtime files + execution proof + consistency report.
Deployment (Vercel)
See DEPLOY.md — takes ~5 minutes.

Push to GitHub
Import in Vercel
Add OPENAI_API_KEY (or Groq key)
Deploy

Contributing
Contributions welcome! Feel free to open issues or PRs.
Author
Gaurav — Odisha, India
Built as part of AI Platform Engineer Internship application.

"Not just generated code — compiled, validated, and proven."
Made with ❤️ using structured intelligence
