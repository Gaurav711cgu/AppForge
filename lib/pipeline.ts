// ================================================================
// PIPELINE ORCHESTRATOR
// The full compiler: NL → Intent → Architecture → Schemas → Refined Config
// ================================================================

import { v4 as uuidv4 } from "uuid";
import { extractIntent } from "./pipeline/stage1-intent";
import { generateArchitecture } from "./pipeline/stage2-architecture";
import { generateSchemas } from "./pipeline/stage3-schemas";
import { validateCrossLayer, buildConsistencyReport } from "./validator";
import { refineSchemas } from "./repair";
import {
  AppConfigSchema,
  type AppConfig, type PipelineResult, type StageResult
} from "@/types";

export async function runPipeline(userPrompt: string): Promise<PipelineResult> {
  const runId = uuidv4();
  const stages: StageResult<unknown>[] = [];
  let totalTokens = 0;
  let totalRetries = 0;
  const pipelineStart = Date.now();

  // ── STAGE 1: Intent Extraction ────────────────────────────────
  console.log(`[${runId}] Stage 1: Intent extraction...`);
  const intentResult = await extractIntent(userPrompt);
  stages.push(intentResult);
  totalTokens += intentResult.tokens_used;
  totalRetries += intentResult.retries;

  if (!intentResult.success || !intentResult.data) {
    return {
      run_id: runId,
      success: false,
      stages,
      total_tokens: totalTokens,
      total_latency_ms: Date.now() - pipelineStart,
      total_retries: totalRetries,
      failure_type: "vague_input",
      assumptions_made: [],
      clarifications_needed: [],
    };
  }

  const intent = intentResult.data;

  // Detect vague input early
  if (intent.confidence < 0.25 && intent.clarifications_needed.length > 5) {
    return {
      run_id: runId,
      success: false,
      stages,
      total_tokens: totalTokens,
      total_latency_ms: Date.now() - pipelineStart,
      total_retries: totalRetries,
      failure_type: "vague_input",
      assumptions_made: intent.assumptions,
      clarifications_needed: intent.clarifications_needed,
    };
  }

  // ── STAGE 2: Architecture ────────────────────────────────────
  console.log(`[${runId}] Stage 2: System design...`);
  const archResult = await generateArchitecture(intent);
  stages.push(archResult);
  totalTokens += archResult.tokens_used;
  totalRetries += archResult.retries;

  if (!archResult.success || !archResult.data) {
    return {
      run_id: runId,
      success: false,
      stages,
      total_tokens: totalTokens,
      total_latency_ms: Date.now() - pipelineStart,
      total_retries: totalRetries,
      failure_type: "schema_violation",
      assumptions_made: intent.assumptions,
      clarifications_needed: intent.clarifications_needed,
    };
  }

  const arch = archResult.data;

  // ── STAGE 3: Schema Generation (parallel) ────────────────────
  console.log(`[${runId}] Stage 3: Generating schemas (parallel)...`);
  const { db: dbResult, api: apiResult, ui: uiResult, auth: authResult } = await generateSchemas(intent, arch);
  stages.push(dbResult, apiResult, uiResult, authResult);
  totalTokens += dbResult.tokens_used + apiResult.tokens_used + uiResult.tokens_used + authResult.tokens_used;
  totalRetries += dbResult.retries + apiResult.retries + uiResult.retries + authResult.retries;

  if (!dbResult.success || !apiResult.success || !uiResult.success || !authResult.success) {
    return {
      run_id: runId,
      success: false,
      stages,
      total_tokens: totalTokens,
      total_latency_ms: Date.now() - pipelineStart,
      total_retries: totalRetries,
      failure_type: "schema_violation",
      assumptions_made: intent.assumptions,
      clarifications_needed: intent.clarifications_needed,
    };
  }

  let db = dbResult.data!;
  let api = apiResult.data!;
  let ui = uiResult.data!;
  let auth = authResult.data!;

  // ── STAGE 4: Validate + Refine ───────────────────────────────
  console.log(`[${runId}] Stage 4: Cross-layer validation + repair...`);
  const validation = validateCrossLayer(db, api, ui, auth, arch);

  let repairRetries = 0;
  let repairApplied = false;

  if (!validation.valid) {
    console.log(`[${runId}] Found ${validation.issues.length} issues, running surgical repair...`);
    const repaired = await refineSchemas(db, api, ui, auth, validation.issues, { intent, arch });
    db = repaired.db;
    api = repaired.api;
    ui = repaired.ui;
    auth = repaired.auth;
    repairRetries = repaired.retries;
    repairApplied = repaired.repairApplied;
    totalRetries += repairRetries;
  }

  // Re-validate after repair
  const finalValidation = validateCrossLayer(db, api, ui, auth, arch);
  const consistencyReport = buildConsistencyReport(finalValidation);
  consistencyReport.issues_resolved = validation.issues.length - finalValidation.issues.length;

  // ── ASSEMBLE FINAL CONFIG ────────────────────────────────────
  const rawConfig = {
    meta: {
      id: runId,
      version: "1.0.0",
      generated_at: new Date().toISOString(),
      pipeline_version: "1.0" as const,
    },
    intent,
    architecture: arch,
    db,
    api,
    ui,
    auth,
    consistency_report: consistencyReport,
  };

  // Final Zod validation of entire AppConfig
  const finalResult = AppConfigSchema.safeParse(rawConfig);

  if (!finalResult.success) {
    return {
      run_id: runId,
      success: false,
      stages,
      total_tokens: totalTokens,
      total_latency_ms: Date.now() - pipelineStart,
      total_retries: totalRetries,
      failure_type: "schema_violation",
      assumptions_made: intent.assumptions,
      clarifications_needed: intent.clarifications_needed,
    };
  }

  console.log(`[${runId}] Pipeline complete. ${totalTokens} tokens, ${totalRetries} retries, ${Date.now() - pipelineStart}ms`);

  return {
    run_id: runId,
    success: true,
    stages,
    final_config: finalResult.data,
    total_tokens: totalTokens,
    total_latency_ms: Date.now() - pipelineStart,
    total_retries: totalRetries,
    assumptions_made: intent.assumptions,
    clarifications_needed: intent.clarifications_needed,
  };
}
