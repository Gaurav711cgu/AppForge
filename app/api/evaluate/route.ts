import { NextRequest, NextResponse } from "next/server";
import { runEvaluation, analyzeCostQualityTradeoff, EVAL_DATASET } from "@/lib/evaluator";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const limit = parseInt(searchParams.get("limit") ?? "5");

  const cases = category
    ? EVAL_DATASET.filter(c => c.category === category).slice(0, limit)
    : EVAL_DATASET.slice(0, limit);

  try {
    const report = await runEvaluation(cases);
    const costAnalysis = analyzeCostQualityTradeoff(report);

    return NextResponse.json({
      report,
      cost_analysis: costAnalysis,
      dataset_info: {
        total_cases: EVAL_DATASET.length,
        real_product: EVAL_DATASET.filter(c => c.category === "real_product").length,
        edge_vague: EVAL_DATASET.filter(c => c.category === "edge_vague").length,
        edge_conflicting: EVAL_DATASET.filter(c => c.category === "edge_conflicting").length,
        edge_incomplete: EVAL_DATASET.filter(c => c.category === "edge_incomplete").length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
