import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import { generateRuntimeCode } from "@/lib/runtime";
import { executeGeneratedSQL, validateTypeScriptOutput } from "@/lib/sql-executor";

// Inlined here to avoid export resolution issues with template-string exports in runtime.ts
function validateGeneratedCode(files: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      const open = (content.match(/\{/g) ?? []).length;
      const close = (content.match(/\}/g) ?? []).length;
      if (Math.abs(open - close) > 2) errors.push(`${filePath}: Unbalanced braces`);
    }
    if (filePath.endsWith(".sql") && !content.includes("CREATE TABLE") && !content.includes("create table")) {
      errors.push(`${filePath}: Missing CREATE TABLE`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt is required", code: "MISSING_PROMPT" }, { status: 400 });
    }

    if (prompt.trim().length < 5) {
      return NextResponse.json({
        error: "Prompt too short.",
        code: "PROMPT_TOO_SHORT",
        clarifications_needed: [
          "What is the main purpose of this application?",
          "Who are the users and what can they do?",
          "What are the main features you need?",
        ],
      }, { status: 422 });
    }

    const result = await runPipeline(prompt);

    if (!result.success || !result.final_config) {
      if (result.failure_type === "vague_input") {
        return NextResponse.json({
          success: false,
          failure_type: "vague_input",
          message: "Input too vague to generate a complete app config.",
          assumptions_made: result.assumptions_made,
          clarifications_needed: result.clarifications_needed,
          pipeline_stages: result.stages.map(s => ({ stage: s.stage, success: s.success, latency_ms: s.latency_ms })),
        }, { status: 422 });
      }
      return NextResponse.json({
        success: false,
        failure_type: result.failure_type ?? "unknown",
        message: "Pipeline failed.",
        stages: result.stages.map(s => ({ stage: s.stage, success: s.success, error: s.error, latency_ms: s.latency_ms, retries: s.retries })),
      }, { status: 500 });
    }

    const runtimeFiles = generateRuntimeCode(result.final_config);
    const codeValidation = validateGeneratedCode(runtimeFiles);
    const sqlExecution = executeGeneratedSQL(result.final_config.db);
    const tsValidation = validateTypeScriptOutput(runtimeFiles["types/generated.ts"] ?? "");

    return NextResponse.json({
      success: true,
      run_id: result.run_id,
      config: result.final_config,
      runtime: {
        files: runtimeFiles,
        file_count: Object.keys(runtimeFiles).length,
        valid: codeValidation.valid && sqlExecution.success,
        code_errors: codeValidation.errors,
      },
      execution_proof: {
        sql: {
          executed: true,
          engine: "SQLite in-memory (node:sqlite)",
          success: sqlExecution.success,
          tables_created: sqlExecution.tables_created,
          tables_failed: sqlExecution.tables_failed,
          insert_test_passed: sqlExecution.insert_test_passed,
          row_count_checks: sqlExecution.row_count_checks,
          execution_time_ms: sqlExecution.execution_time_ms,
          errors: sqlExecution.errors,
        },
        typescript: {
          valid: tsValidation.valid,
          interface_count: (runtimeFiles["types/generated.ts"] ?? "").match(/interface\s+\w+/g)?.length ?? 0,
          issues: tsValidation.issues,
        },
      },
      meta: {
        total_tokens: result.total_tokens,
        total_latency_ms: result.total_latency_ms,
        total_retries: result.total_retries,
        assumptions_made: result.assumptions_made,
        clarifications_needed: result.clarifications_needed,
        pipeline_stages: result.stages.map(s => ({
          stage: s.stage, success: s.success, latency_ms: s.latency_ms,
          tokens_used: s.tokens_used, retries: s.retries, repair_applied: s.repair_applied,
        })),
        consistency_report: result.final_config.consistency_report,
      },
    });

  } catch (err) {
    console.error("Pipeline error:", err);
    return NextResponse.json({ success: false, failure_type: "api_error", error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}
