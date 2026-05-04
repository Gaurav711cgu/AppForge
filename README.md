GitHub Description (paste in repo settings)

AI-powered compiler that converts natural language into validated, executable full-stack app configs. Features multi-stage LLM pipeline, Zod validation, cross-layer checks, auto-repair, and SQLite execution proof.

📄 FULL README.md (FINAL VERSION)
# ⚡ AppForge — AI Application Compiler

> Turn natural language into validated, executable, production-ready app blueprints.

AppForge is a **compiler-style AI system** that transforms plain English product ideas into structured, validated, and executable full-stack application configurations.

Unlike typical AI generators, AppForge enforces **strict validation, cross-layer consistency, and execution proof**, making outputs reliable and production-oriented.

---

## 🔥 Why AppForge?

Most AI tools:
- Generate inconsistent outputs
- Lack validation
- Cannot prove execution

**AppForge solves this by behaving like a compiler.**

---

## 🧠 Compiler Analogy

| Compiler Stage        | AppForge Equivalent              |
|----------------------|---------------------------------|
| Source Code          | Natural Language Prompt         |
| Lexical Analysis     | Intent Extraction               |
| Abstract Syntax Tree | System Design                   |
| Code Generation      | Schema + API + UI               |
| Linking              | Cross-layer Validation          |
| Execution            | SQL Runtime Proof               |

---

## ⚙️ Core Features

- ⚡ Multi-stage LLM pipeline (4 stages)
- 🧩 Zod schema validation at every stage
- 🔍 Cross-layer consistency checks (7 rules)
- 🛠️ Automatic error repair system
- 🧪 SQLite execution proof (real runtime validation)
- 🔁 Deterministic outputs (`temperature=0`, `seed=42`)
- ⚡ Parallel + sequential pipeline optimization
- 📦 Strongly typed, production-ready outputs

---

## 🏗️ Architecture Overview


User Prompt
│
▼
Stage 1 — Intent Extraction

Extract entities, roles, features
Confidence scoring

Fail-fast on low confidence

▼
Stage 2 — System Design

Data models
User flows
Business logic

Authentication strategy

▼
Stage 3 — Schema Generation

Database schema
API routes
UI structure

Fully validated with Zod

▼
Stage 4 — Refinement & Repair

Cross-layer consistency checks
Automatic fixes

Re-validation

▼
Execution Layer

SQL generated & executed
SQLite runtime proof returned

---

## 🧪 Execution Proof (Key Differentiator)

AppForge doesn’t stop at generation.

It:
1. Converts schema → SQL  
2. Executes SQL in SQLite  
3. Returns execution status  

Example:

```json
{
  "execution_proof": {
    "tables_created": true,
    "queries_executed": true
  }
}

This ensures outputs are not just valid—but runnable.

📂 Project Structure
app/
 ├── api/
 │   ├── evaluate/        # Evaluation pipeline
 │   ├── pipeline/        # Core compiler pipeline
 ├── (demo)/              # Demo UI

lib/
 ├── pipeline.ts          # Pipeline orchestration
 ├── evaluator.ts         # Validation & scoring

data/
 ├── mock-eval.js
 ├── run-eval.ts

config/
 ├── schema definitions (Zod)
🛠️ Tech Stack
Frontend: Next.js, React, TailwindCSS
Backend: Next.js API Routes
Language: TypeScript
Validation: Zod
Database: SQLite (runtime execution)
AI: Structured JSON outputs via LLM
🚀 Getting Started
1. Clone Repository
git clone https://github.com/your-username/appforge.git
cd appforge
2. Install Dependencies
npm install
3. Setup Environment Variables
cp .env.example .env

Add your API key inside .env.

4. Run the Project
npm run dev

App will start on:

http://localhost:3000
🧪 Example Input
Build a task management app with roles, deadlines, and notifications
📤 Example Output Includes
Data Models
API Endpoints
Authentication Strategy
UI Structure
SQL Execution Proof
📊 Evaluation System

AppForge includes a built-in evaluator that checks:

Schema correctness
Structural integrity
Cross-layer consistency
Execution validity
🎯 What Makes This Unique
🔁 Treats AI as a compiler, not a chatbot
🧪 Includes execution proof
🛠️ Has auto-repair system
🔍 Ensures cross-layer consistency
📦 Produces production-ready structured outputs
🧠 Future Roadmap
PostgreSQL / MongoDB support
Full code generation (frontend + backend)
CI/CD pipeline generation
Multi-agent architecture
Deployment validation
👨‍💻 Author

Gaurav Kumar Nayak
BTech CSE | AI Systems | Full-Stack Engineering

Focused on building real-world, production-grade AI systems.

📄 License

MIT License
