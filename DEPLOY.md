# AppForge — Deployment & Hosting Guide

Complete step-by-step. From your local machine to a live URL in ~15 minutes.

---

## Step 1 — Push to GitHub

```bash
# 1. Go to https://github.com/new
# Create repo named: appforge
# Set to Public, no README (you already have one)

# 2. In your project folder:
cd appforge

git init
git add .
git commit -m "feat: initial AppForge compiler pipeline

- 4-stage NL → app config pipeline (intent, arch, schemas, refinement)
- Zod schema validation on all layers
- 7 cross-layer consistency checks
- Surgical per-layer repair engine
- SQLite execution proof via node:sqlite
- 20-case evaluation framework
- Cost/quality tradeoff analysis"

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/appforge.git
git push -u origin main
```

---

## Step 2 — Deploy to Vercel (free, takes 3 minutes)

### Option A — Vercel dashboard (easiest)

1. Go to **https://vercel.com** → Sign up with GitHub
2. Click **"Add New Project"**
3. Import your `appforge` repo
4. Under **Environment Variables**, add:
   ```
   OPENAI_API_KEY = sk-your-key-here
   ```
5. Click **Deploy**
6. Your live URL: `https://appforge-yourname.vercel.app`

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login

cd appforge
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: appforge
# - Directory: ./
# - Override settings? No

# Add env variable:
vercel env add OPENAI_API_KEY
# Paste your sk-... key when prompted

# Deploy to production:
vercel --prod
```

---

## Step 3 — Verify deployment

```bash
# Test your live API:
curl -X POST https://appforge-yourname.vercel.app/api/pipeline \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics."}'

# Should return JSON with:
# - success: true
# - config.intent.app_name
# - execution_proof.sql.success: true
# - runtime.file_count > 0
```

---

## Step 4 — Submit

In your Google Form submission:
- **Live URL**: `https://appforge-yourname.vercel.app`
- **GitHub repo**: `https://github.com/YOUR_USERNAME/appforge`
- **Loom video**: record after deployment so you can show the live URL

---

## Loom Video Script (5–10 min)

### Minute 0–1: Open with the core concept
> "This is AppForge — an AI application compiler. The key word is compiler.
> Not a prompt wrapper, not a chatbot. A system with 4 defined stages,
> typed contracts between stages, validation, and repair.
> I'm going to show you the architecture, then the live demo, then the eval results."

### Minute 1–3: Architecture walkthrough
- Open `lib/pipeline.ts` — show the orchestrator
- Open `lib/pipeline/stage1-intent.ts` — explain: "this is the lexer"
- Open `lib/validator.ts` — show the 7 checks: "this is the linker"
- Open `lib/repair.ts` — explain surgical repair vs brute retry
- Open `lib/sql-executor.ts` — "this is what makes it executable, not just generated"

### Minute 3–6: Live demo
- Open `https://appforge-yourname.vercel.app`
- Paste: `"Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics."`
- Watch the 5 stages go green one by one
- After completion, click **"Execution Proof"** tab — show SQL tables created, insert test passed
- Click **"Runtime Files"** tab — show generated TypeScript, SQL, React pages
- Click **"Consistency"** tab — show all cross-layer checks

### Minute 6–8: Eval results + tradeoffs
- Open README.md → scroll to eval results table
- Say: "95% success rate on 20 cases. 100% on real product prompts.
  Repair engine succeeded 7/7 times it was triggered. $0.054 per request."
- Explain the one failure: "edge_vague_03 failed because 'like Airbnb but different'
  — the word 'different' is undefined. The system correctly refused to commit
  to a wrong architecture rather than produce plausible garbage."
- Show cost tradeoff table: "gpt-4o for everything because Stage 1 errors cascade.
  At scale, Stage 1 could be mini — that's a future optimization."

### Minute 8–10: What you'd do differently
> "If I had more time: I'd add a confidence threshold for mid-pipeline abort
> not just at Stage 1. I'd add response caching for near-identical prompts.
> I'd run the generated TypeScript through tsc --noEmit in a subprocess rather
> than just structural validation. And I'd add a streaming endpoint so the UI
> updates in real-time as each schema is generated."

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key (sk-...) |
| `NEXT_PUBLIC_APP_URL` | No | Your deployed URL (optional) |

---

## Troubleshooting

**Build fails on Vercel:**
```bash
# Ensure Node 22+ is set in Vercel project settings
# Settings → General → Node.js Version → 22.x
```

**`node:sqlite` not found:**
```bash
# This requires Node 22+. Check your version:
node --version  # must be v22+
# In Vercel: Settings → General → Node.js Version → 22.x
```

**Pipeline times out (Vercel 60s limit):**
```bash
# Add to next.config.mjs:
export const maxDuration = 60; // seconds (Pro plan: 300s)

# Or use Vercel's fluid compute for longer tasks
```

**OpenAI rate limit:**
- Free tier: 3 requests/min on gpt-4o
- Use `--limit=2` in eval to avoid hitting limits
- Or upgrade to Tier 1 ($5 spend)

---

## Cost estimate (live URL)

If 100 people test your submission:
- 100 pipeline runs × $0.054 = **$5.40 total**
- Well within the free OpenAI $5 credit or a $10 top-up
