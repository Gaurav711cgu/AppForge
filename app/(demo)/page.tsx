"use client";

import { useState } from "react";

type StageStatus = "waiting" | "running" | "done" | "failed";
type TabId = "config" | "runtime" | "execution" | "consistency" | "meta";

interface Stage {
  id: string; label: string; description: string; status: StageStatus;
  latency_ms?: number; tokens_used?: number; retries?: number; repair_applied?: boolean;
}

interface SQLProof {
  executed: boolean; engine: string; success: boolean;
  tables_created: string[]; tables_failed: { table: string; error: string }[];
  insert_test_passed: boolean; row_count_checks: { table: string; count: number }[];
  execution_time_ms: number; errors: string[];
}

interface PipelineResponse {
  success: boolean; run_id: string;
  config?: Record<string, unknown>;
  runtime?: { files: Record<string, string>; file_count: number; valid: boolean; code_errors: string[] };
  execution_proof?: { sql: SQLProof; typescript: { valid: boolean; interface_count: number; issues: string[] } };
  meta?: {
    total_tokens: number; total_latency_ms: number; total_retries: number;
    assumptions_made: string[]; clarifications_needed: string[];
    pipeline_stages: Array<{ stage: string; success: boolean; latency_ms: number; tokens_used: number; retries: number; repair_applied: boolean }>;
    consistency_report: { issues_found: number; issues_resolved: number; warnings: string[]; cross_layer_checks: Array<{ check: string; passed: boolean; detail?: string }> };
  };
  // Failure fields
  clarifications_needed?: string[];
  assumptions_made?: string[];
  failure_type?: string;
  message?: string;
  error?: string;
  // Failure includes stages so we can update UI accurately
  stages?: Array<{ stage: string; success: boolean; latency_ms: number; tokens_used: number; retries: number; repair_applied?: boolean; error?: string }>;
}

const INITIAL_STAGES: Stage[] = [
  { id: "intent_extraction", label: "Stage 1 — Intent Extraction", description: "NL → entities, roles, pages, features, confidence score", status: "waiting" },
  { id: "system_design", label: "Stage 2 — System Design", description: "Intent → data models, user flows, auth strategy, business rules", status: "waiting" },
  { id: "schema_generation", label: "Stage 3 — Schema Generation", description: "DB + API + Auth (parallel) → UI (sequential)", status: "waiting" },
  { id: "validation_repair", label: "Stage 4 — Refinement & Repair", description: "7 cross-layer checks + surgical per-layer repair", status: "waiting" },
  { id: "runtime", label: "Runtime — Execution", description: "AppConfig → React files + SQL executed in SQLite", status: "waiting" },
];

// Bug fix: map the pipeline's internal stage IDs (which include 4 separate schema
// sub-stages: db_schema, api_schema, ui_schema, auth_schema) to the single
// "schema_generation" UI stage. Previously none of these matched, so Stage 3 never
// flipped to "done" and Stages 4 + Runtime never updated either.
const STAGE_ID_MAP: Record<string, string> = {
  intent_extraction: "intent_extraction",
  system_design:     "system_design",
  architecture:      "system_design",
  db_schema:         "schema_generation",
  api_schema:        "schema_generation",
  ui_schema:         "schema_generation",
  auth_schema:       "schema_generation",
  schema_generation: "schema_generation",
  validation_repair: "validation_repair",
  repair:            "validation_repair",
  runtime:           "runtime",
};

const EXAMPLES = [
  "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.",
  "Multi-vendor marketplace where sellers list products, buyers purchase with Stripe, admins approve listings. Reviews, search, categories.",
  "SaaS learning platform. Instructors create courses with video lessons and quizzes. Students enroll and track progress. Free and paid tiers.",
  "HR management system. Track employees, departments, leave requests, performance reviews. HR managers approve leaves. Employees see own data.",
];

export default function AppForgePage() {
  const [prompt, setPrompt] = useState("");
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("config");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  function updateStage(id: string, update: Partial<Stage>) {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...update } : s));
  }

  // Bug fix: apply stage updates from the API response using the ID mapping,
  // merging metadata from multiple sub-stages (e.g. all 4 schema stages)
  // into the single "schema_generation" UI row.
  function applyStagesFromResponse(
    rawStages: PipelineResponse["meta"]["pipeline_stages"]
  ) {
    // Accumulate per UI-stage: any failure = failed, merge tokens/retries
    const accumulated: Record<string, {
      success: boolean; latency_ms: number;
      tokens_used: number; retries: number; repair_applied: boolean;
    }> = {};

    for (const ps of rawStages) {
      const uiId = STAGE_ID_MAP[ps.stage] ?? ps.stage;
      if (!accumulated[uiId]) {
        accumulated[uiId] = { success: true, latency_ms: 0, tokens_used: 0, retries: 0, repair_applied: false };
      }
      const acc = accumulated[uiId];
      if (!ps.success) acc.success = false;
      acc.latency_ms    += ps.latency_ms ?? 0;
      acc.tokens_used   += ps.tokens_used ?? 0;
      acc.retries       += ps.retries ?? 0;
      acc.repair_applied = acc.repair_applied || !!ps.repair_applied;
    }

    for (const [uiId, data] of Object.entries(accumulated)) {
      updateStage(uiId, {
        status:        data.success ? "done" : "failed",
        latency_ms:    data.latency_ms || undefined,
        tokens_used:   data.tokens_used || undefined,
        retries:       data.retries || undefined,
        repair_applied: data.repair_applied || undefined,
      });
    }
  }

  async function runPipeline() {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setResult(null);
    setStages(INITIAL_STAGES.map(s => ({ ...s, status: "waiting" })));

    // Mark Stage 1 as running immediately — the only reliable visual cue
    // we have before the API responds. We no longer use hardcoded timers
    // for the other stages because they were pure guesses and caused the UI
    // to show stages as "running" long after the API had already responded
    // with a failure.
    updateStage("intent_extraction", { status: "running" });

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data: PipelineResponse = await res.json();

      if (data.success && data.meta) {
        // Success path: use real stage data from the API response
        applyStagesFromResponse(data.meta.pipeline_stages);
        // Stage 4 and runtime are handled by the meta stages or set explicitly
        updateStage("validation_repair", { status: "done" });
        updateStage("runtime", {
          status: data.execution_proof?.sql.success ? "done" : "failed",
          latency_ms: data.execution_proof?.sql.execution_time_ms,
        });
      } else {
        // Bug fix: failure path — use stages from the response if available,
        // so we mark exactly the failed stage(s) rather than guessing which
        // one happened to be "running" in the UI at the time of failure.
        const failureStages = data.meta?.pipeline_stages ?? data.stages ?? [];

        if (failureStages.length > 0) {
          applyStagesFromResponse(failureStages);
          // Mark any remaining "waiting" stages that were never reached
          setStages(prev => prev.map(s =>
            s.status === "waiting" || s.status === "running" ? { ...s, status: "waiting" } : s
          ));
        } else {
          // No stage data at all — just mark the currently-running one as failed
          setStages(prev => prev.map(s =>
            s.status === "running" ? { ...s, status: "failed" } : s
          ));
        }
      }

      setResult(data);
      if (data.runtime?.files) setSelectedFile(Object.keys(data.runtime.files)[0] ?? null);
    } catch {
      setStages(prev => prev.map(s =>
        s.status === "running" ? { ...s, status: "failed" } : s
      ));
      setResult({ success: false, run_id: "", failure_type: "api_error", message: "Network error — check your connection and try again." });
    } finally {
      setRunning(false);
    }
  }

  const config = result?.config as Record<string, unknown> | undefined;
  const sql = result?.execution_proof?.sql;
  const ts = result?.execution_proof?.typescript;

  const TABS: { id: TabId; label: string }[] = [
    { id: "config",      label: "App Config" },
    { id: "execution",   label: `Execution Proof${sql ? (sql.success ? " ✓" : " ✗") : ""}` },
    { id: "runtime",     label: `Runtime Files (${result?.runtime?.file_count ?? 0})` },
    { id: "consistency", label: "Consistency" },
    { id: "meta",        label: "Pipeline Meta" },
  ];

  // Helper: human-readable error message per failure_type
  function failureMessage(data: PipelineResponse) {
    if (data.failure_type === "llm_error") {
      return {
        icon: "🔑",
        color: "#f87171",
        title: "LLM / API Error",
        body: data.message ?? data.error ?? "The AI model could not be reached.",
        hint: "Check that XAI_API_KEY (or OPENAI_API_KEY) is set correctly in your .env.local file.",
      };
    }
    if (data.failure_type === "vague_input") {
      return {
        icon: "⚠",
        color: "#f59e0b",
        title: "Needs Clarification",
        body: data.message ?? "Input too vague to generate a complete app config.",
        hint: null,
      };
    }
    if (data.failure_type === "api_error") {
      return {
        icon: "🔌",
        color: "#f87171",
        title: "Network Error",
        body: data.message ?? "Could not reach the pipeline API.",
        hint: null,
      };
    }
    return {
      icon: "✗",
      color: "#f87171",
      title: "Pipeline Failed",
      body: data.message ?? "An unexpected error occurred.",
      hint: `failure_type: ${data.failure_type ?? "unknown"}`,
    };
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ borderBottom: "1px solid #1e2530", padding: "14px 28px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 30, height: 30, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚡</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>AppForge</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>AI Application Compiler — NL → Validated + Executable App Config</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["4-Stage Pipeline", "Zod Validation", "Surgical Repair", "SQL Execution", "Eval Framework"].map(t => (
            <span key={t} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: "#1e293b", color: "#64748b", border: "1px solid #334155" }}>{t}</span>
          ))}
        </div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 61px)" }}>
        {/* LEFT */}
        <div style={{ width: 370, borderRight: "1px solid #1e2530", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: 18, borderBottom: "1px solid #1e2530" }}>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500, letterSpacing: "0.05em" }}>DESCRIBE YOUR APPLICATION</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments."
              style={{ width: "100%", height: 100, background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 8, padding: "10px 12px", color: "#e2e8f0", fontSize: 12, resize: "none", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }}
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey) runPipeline(); }}
            />
            <button onClick={runPipeline} disabled={running || !prompt.trim()}
              style={{ marginTop: 8, width: "100%", padding: "9px 0", borderRadius: 8, border: "none", background: running ? "#1e2530" : "linear-gradient(135deg, #6366f1, #8b5cf6)", color: running ? "#64748b" : "#fff", fontWeight: 600, fontSize: 13, cursor: running ? "not-allowed" : "pointer" }}>
              {running ? "⚡ Compiling..." : "⚡ Compile Application"}
            </button>
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {EXAMPLES.map((p, i) => (
                <button key={i} onClick={() => setPrompt(p)}
                  style={{ fontSize: 10, padding: "2px 7px", background: "#1a1f2e", border: "1px solid #2d3748", borderRadius: 4, color: "#64748b", cursor: "pointer" }}>
                  Example {i + 1}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 10, fontWeight: 500, letterSpacing: "0.07em" }}>COMPILER PIPELINE</div>
            {stages.map(stage => (
              <div key={stage.id} style={{
                marginBottom: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid",
                borderColor: stage.status === "done" ? "#166534" : stage.status === "running" ? "#1e40af" : stage.status === "failed" ? "#991b1b" : "#1e2530",
                background: stage.status === "done" ? "#052e16" : stage.status === "running" ? "#0c1a3d" : stage.status === "failed" ? "#1c0a0a" : "#0f1117",
                transition: "all 0.3s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: stage.status === "done" ? "#4ade80" : stage.status === "running" ? "#60a5fa" : stage.status === "failed" ? "#f87171" : "#475569", fontSize: 13 }}>
                      {stage.status === "running" ? "◌" : stage.status === "done" ? "✓" : stage.status === "failed" ? "✗" : "○"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: stage.status === "waiting" ? "#475569" : "#e2e8f0" }}>{stage.label}</span>
                  </div>
                  {stage.latency_ms ? <span style={{ fontSize: 10, color: "#64748b" }}>{stage.latency_ms}ms</span> : null}
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 3, paddingLeft: 20 }}>{stage.description}</div>
                {(stage.tokens_used || stage.retries !== undefined) && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4, paddingLeft: 20 }}>
                    {stage.tokens_used ? <span style={{ fontSize: 10, color: "#64748b" }}>~{stage.tokens_used} tok</span> : null}
                    {stage.retries ? <span style={{ fontSize: 10, color: "#f59e0b" }}>{stage.retries} retries</span> : null}
                    {stage.repair_applied ? <span style={{ fontSize: 10, color: "#a78bfa" }}>🔧 repaired</span> : null}
                  </div>
                )}
              </div>
            ))}

            {/* Run metrics — only show on success */}
            {result?.meta && result.success && (() => {
              const metrics = [
                ["Tokens",  result.meta!.total_tokens.toLocaleString()],
                ["Latency", `${(result.meta!.total_latency_ms / 1000).toFixed(1)}s`],
                ["Retries", String(result.meta!.total_retries)],
                ["Checks",  `${result.meta!.consistency_report.cross_layer_checks.filter(c => c.passed).length}/${result.meta!.consistency_report.cross_layer_checks.length} passed`],
                ["SQL",     result.execution_proof?.sql.success ? `✓ ${result.execution_proof.sql.tables_created.length} tables` : "✗ failed"],
                ["TS",      result.execution_proof?.typescript.valid ? `✓ ${result.execution_proof.typescript.interface_count} ifaces` : "✗ issues"],
              ];
              return (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b" }}>
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>RUN METRICS</div>
                  {metrics.map(row => (
                    <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: "#64748b" }}>{row[0]}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>{row[1]}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!result ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#334155" }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>⚡</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "#475569" }}>Ready to compile</div>
              <div style={{ fontSize: 12, textAlign: "center", maxWidth: 380, lineHeight: 1.7, color: "#334155" }}>
                Describe your application. The compiler runs 4 stages, validates all schemas, repairs inconsistencies, executes SQL, and generates working code.
              </div>
            </div>
          ) : !result.success ? (
            // Bug fix: render the correct error UI based on failure_type.
            // Previously all failures showed "Needs Clarification" even when
            // the real issue was a missing API key.
            <div style={{ flex: 1, padding: 28 }}>
              {(() => {
                const fm = failureMessage(result);
                return (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 600, color: fm.color, marginBottom: 6 }}>
                      {fm.icon} {fm.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: fm.hint ? 8 : 16 }}>{fm.body}</div>
                    {fm.hint && (
                      <div style={{ marginBottom: 16, padding: "8px 12px", background: "#1a1f2e", borderRadius: 6, fontSize: 12, color: "#f59e0b", border: "1px solid #f59e0b33" }}>
                        💡 {fm.hint}
                      </div>
                    )}
                    {result.clarifications_needed && result.clarifications_needed.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>CLARIFICATIONS NEEDED</div>
                        {result.clarifications_needed.map((c, i) => (
                          <div key={i} style={{ padding: "8px 12px", background: "#1a1f2e", borderRadius: 6, marginBottom: 5, fontSize: 12, color: "#cbd5e1", border: "1px solid #f59e0b22" }}>{i + 1}. {c}</div>
                        ))}
                      </div>
                    )}
                    {result.assumptions_made && result.assumptions_made.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>ASSUMPTIONS MADE</div>
                        {result.assumptions_made.map((a, i) => (
                          <div key={i} style={{ padding: "7px 12px", background: "#1a1f2e", borderRadius: 6, marginBottom: 4, fontSize: 12, color: "#94a3b8" }}>• {a}</div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", borderBottom: "1px solid #1e2530", padding: "0 18px", flexShrink: 0 }}>
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{ padding: "10px 14px", fontSize: 11, fontWeight: 500, border: "none", background: "none", cursor: "pointer", color: activeTab === tab.id ? "#a78bfa" : "#64748b", borderBottom: activeTab === tab.id ? "2px solid #a78bfa" : "2px solid transparent", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflow: "auto" }}>

                {/* CONFIG */}
                {activeTab === "config" && config && (() => {
                  const cards = [
                    ["App Name",      String((config.intent as Record<string,unknown>)?.app_name ?? "")],
                    ["Type",          String((config.intent as Record<string,unknown>)?.app_type ?? "")],
                    ["DB Tables",     String(((config.db as Record<string,unknown>)?.tables as unknown[])?.length ?? 0)],
                    ["API Endpoints", String(((config.api as Record<string,unknown>)?.endpoints as unknown[])?.length ?? 0)],
                    ["UI Pages",      String(((config.ui as Record<string,unknown>)?.pages as unknown[])?.length ?? 0)],
                    ["Auth Roles",    String(((config.auth as Record<string,unknown>)?.roles as unknown[])?.length ?? 0)],
                    ["Data Models",   String(((config.architecture as Record<string,unknown>)?.data_models as unknown[])?.length ?? 0)],
                    ["Confidence",    `${Math.round(((config.intent as Record<string,unknown>)?.confidence as number ?? 0) * 100)}%`],
                  ];
                  return (
                    <div style={{ padding: 18 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                        {cards.map(row => (
                          <div key={row[0]} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 7, padding: "10px 12px" }}>
                            <div style={{ fontSize: 9, color: "#64748b", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{row[0]}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{row[1]}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>FULL APP CONFIG JSON</div>
                        <pre style={{ fontSize: 11, color: "#94a3b8", overflow: "auto", maxHeight: 480, lineHeight: 1.6, margin: 0 }}>{JSON.stringify(config, null, 2)}</pre>
                      </div>
                    </div>
                  );
                })()}

                {/* EXECUTION PROOF */}
                {activeTab === "execution" && result.execution_proof && (
                  <div style={{ padding: 18 }}>
                    <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 8, background: sql?.success ? "#052e16" : "#1c0a0a", border: `1px solid ${sql?.success ? "#166534" : "#991b1b"}` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: sql?.success ? "#4ade80" : "#f87171", marginBottom: 4 }}>
                        {sql?.success ? "✓ SQL Execution Successful" : "✗ SQL Execution Failed"}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Engine: {sql?.engine} · {sql?.execution_time_ms}ms</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontWeight: 500 }}>TABLES CREATED ({sql?.tables_created.length})</div>
                        {sql?.tables_created.map(t => (
                          <div key={t} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1e293b" }}>
                            <span style={{ fontSize: 12, color: "#86efac" }}>✓ {t}</span>
                            <span style={{ fontSize: 11, color: "#64748b" }}>{sql.row_count_checks.find(r => r.table === t)?.count ?? 0} rows</span>
                          </div>
                        ))}
                        {sql?.tables_failed.map(f => (
                          <div key={f.table} style={{ padding: "5px 0", borderBottom: "1px solid #1e293b" }}>
                            <div style={{ fontSize: 12, color: "#f87171" }}>✗ {f.table}</div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>{f.error}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontWeight: 500 }}>VALIDATION CHECKS</div>
                        {[
                          { label: "INSERT test",     value: sql?.insert_test_passed ? "✓ Passed" : "✗ Failed",                              ok: sql?.insert_test_passed },
                          { label: "TypeScript types", value: ts?.valid ? `✓ ${ts.interface_count} interfaces` : "✗ Issues found",            ok: ts?.valid },
                          { label: "SQL syntax",       value: sql?.success ? "✓ All statements ran" : "✗ Errors found",                      ok: sql?.success },
                        ].map(item => (
                          <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>{item.label}</span>
                            <span style={{ fontSize: 12, color: item.ok ? "#4ade80" : "#f87171" }}>{item.value}</span>
                          </div>
                        ))}
                        {sql?.errors && sql.errors.length > 0 && sql.errors.map((err, i) => (
                          <div key={i} style={{ fontSize: 10, color: "#f87171", marginTop: 3 }}>✗ {err}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* RUNTIME FILES */}
                {activeTab === "runtime" && result.runtime && (
                  <div style={{ display: "flex", height: "100%" }}>
                    <div style={{ width: 210, borderRight: "1px solid #1e2530", overflowY: "auto", padding: 10, flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>FILES ({result.runtime.file_count})</div>
                      {Object.keys(result.runtime.files).map(file => (
                        <button key={file} onClick={() => setSelectedFile(file)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 7px", borderRadius: 4, fontSize: 10, color: selectedFile === file ? "#a78bfa" : "#64748b", background: selectedFile === file ? "#1e1a3d" : "transparent", border: "none", cursor: "pointer", wordBreak: "break-all", lineHeight: 1.5 }}>
                          {file}
                        </button>
                      ))}
                    </div>
                    <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
                      {selectedFile && (
                        <>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6 }}>{selectedFile}</div>
                          <pre style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{result.runtime.files[selectedFile]}</pre>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* CONSISTENCY */}
                {activeTab === "consistency" && result.meta && (
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontWeight: 500 }}>CROSS-LAYER CHECKS</div>
                        {result.meta.consistency_report.cross_layer_checks.map((check, i) => (
                          <div key={i} style={{ display: "flex", gap: 7, padding: "6px 9px", borderRadius: 6, background: check.passed ? "#052e16" : "#1c0a0a", marginBottom: 4, border: `1px solid ${check.passed ? "#166534" : "#991b1b"}` }}>
                            <span style={{ color: check.passed ? "#4ade80" : "#f87171", flexShrink: 0, fontSize: 11 }}>{check.passed ? "✓" : "✗"}</span>
                            <div>
                              <div style={{ fontSize: 11, color: check.passed ? "#86efac" : "#fca5a5" }}>{check.check}</div>
                              {check.detail && <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{check.detail}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontWeight: 500 }}>WARNINGS & ASSUMPTIONS</div>
                        {result.meta.consistency_report.warnings.length === 0
                          ? <div style={{ color: "#4ade80", fontSize: 12 }}>✓ No warnings</div>
                          : result.meta.consistency_report.warnings.map((w, i) => (
                            <div key={i} style={{ padding: "6px 9px", background: "#1c1200", borderRadius: 6, marginBottom: 4, fontSize: 11, color: "#fbbf24", border: "1px solid #78350f" }}>⚠ {w}</div>
                          ))}
                        {result.meta.assumptions_made.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>ASSUMPTIONS ({result.meta.assumptions_made.length})</div>
                            {result.meta.assumptions_made.map((a, i) => (
                              <div key={i} style={{ padding: "5px 9px", background: "#0f172a", borderRadius: 5, marginBottom: 3, fontSize: 11, color: "#94a3b8" }}>• {a}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* META */}
                {activeTab === "meta" && result.meta && (
                  <div style={{ padding: 18 }}>
                    <pre style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{JSON.stringify(result.meta, null, 2)}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
