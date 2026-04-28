// Run with: npm run evaluate
// Executes full 20-case eval and writes report to eval-report.json

import { runEvaluation, analyzeCostQualityTradeoff, EVAL_DATASET } from "../lib/evaluator";
import fs from "fs";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     AppForge Evaluation Framework        ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "20");
  const category = args.find(a => a.startsWith("--category="))?.split("=")[1];

  const cases = category
    ? EVAL_DATASET.filter(c => c.category === category).slice(0, limit)
    : EVAL_DATASET.slice(0, limit);

  console.log(`Running ${cases.length} cases${category ? ` (category: ${category})` : ""}...\n`);

  const report = await runEvaluation(cases, 1); // concurrency=1 for CLI
  const cost = analyzeCostQualityTradeoff(report);

  console.log("\n══════════════ RESULTS ══════════════");
  console.log(`Success rate:        ${(report.success_rate * 100).toFixed(0)}%  (${cases.filter((_,i) => report.results[i]?.success).length}/${cases.length})`);
  console.log(`Avg latency:         ${(report.avg_latency_ms / 1000).toFixed(1)}s`);
  console.log(`Avg tokens:          ${report.avg_tokens.toLocaleString()}`);
  console.log(`Avg retries:         ${report.avg_retries}`);
  console.log(`Repair success rate: ${(report.repair_success_rate * 100).toFixed(0)}%`);
  console.log(`Cost per request:    $${cost.cost_per_request_usd}`);
  console.log(`Total cost:          $${cost.total_cost_usd}`);

  if (Object.keys(report.failure_breakdown).length > 0) {
    console.log("\nFailure breakdown:");
    for (const [type, count] of Object.entries(report.failure_breakdown)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  console.log("\nPer-case results:");
  for (const result of report.results) {
    const icon = result.success ? "✓" : "✗";
    const repair = result.repair_applied ? " 🔧" : "";
    console.log(`  ${icon} ${result.case_id.padEnd(20)} ${(result.latency_ms/1000).toFixed(1)}s  ${result.tokens_used.toLocaleString()} tok  ${result.retries} retries${repair}`);
  }

  // Write full report
  const output = { generated_at: new Date().toISOString(), report, cost_analysis: cost };
  fs.writeFileSync("eval-report.json", JSON.stringify(output, null, 2));
  console.log("\n✓ Full report written to eval-report.json");
  console.log(`\nRecommendation: ${cost.recommendation}`);
}

main().catch(console.error);
