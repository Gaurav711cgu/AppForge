// ================================================================
// EVALUATION FRAMEWORK
// 10 real product prompts + 10 edge cases
// Tracks: success rate, retries, failure types, latency, consistency
// ================================================================

import type { EvalCase, EvalResult, EvalReport } from "@/types";
import { runPipeline } from "@/lib/pipeline";
import { validateCrossLayer } from "@/lib/validator";
import fs from "fs";

// ── DATASET ──────────────────────────────────────────────────────

export const EVAL_DATASET: EvalCase[] = [
  // ── REAL PRODUCT PROMPTS (10) ─────────────────────────────────
  {
    id: "real_01",
    category: "real_product",
    prompt: "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.",
    expected_entities: ["Contact", "User", "Organization", "Deal"],
    expected_pages: ["Dashboard", "Contacts", "Analytics", "Settings"],
  },
  {
    id: "real_02",
    category: "real_product",
    prompt: "Create a project management tool like Jira. Users can create projects, tasks, epics. Tasks have assignees, priority, status, and due dates. Managers see all projects. Devs see assigned tasks only.",
    expected_entities: ["Project", "Task", "Epic", "User"],
    expected_pages: ["Board", "Backlog", "Projects", "Profile"],
  },
  {
    id: "real_03",
    category: "real_product",
    prompt: "Multi-vendor marketplace where sellers list products, buyers purchase with Stripe, and admins approve listings. Reviews, search, categories.",
    expected_entities: ["Product", "Order", "Review", "Vendor"],
    expected_pages: ["Home", "Product", "Cart", "Checkout", "Seller Dashboard"],
  },
  {
    id: "real_04",
    category: "real_product",
    prompt: "SaaS learning platform. Instructors create courses with video lessons and quizzes. Students enroll and track progress. Free and paid tiers.",
    expected_entities: ["Course", "Lesson", "Quiz", "Enrollment"],
    expected_pages: ["Course Catalog", "Course Detail", "Dashboard", "Instructor Studio"],
  },
  {
    id: "real_05",
    category: "real_product",
    prompt: "Healthcare appointment booking system. Patients book appointments with doctors. Doctors manage their schedule. Receptionists can view all appointments. Email reminders sent.",
    expected_entities: ["Patient", "Doctor", "Appointment", "Schedule"],
    expected_pages: ["Booking", "Doctor Profile", "My Appointments", "Admin View"],
  },
  {
    id: "real_06",
    category: "real_product",
    prompt: "Inventory management for a warehouse. Track stock levels, purchase orders, suppliers, and locations. Low stock alerts. Generate reports.",
    expected_entities: ["Product", "Supplier", "PurchaseOrder", "Location"],
    expected_pages: ["Inventory", "Orders", "Suppliers", "Reports"],
  },
  {
    id: "real_07",
    category: "real_product",
    prompt: "Social platform for developers. Share code snippets, projects, follow others, like and comment. GitHub OAuth login. Tag-based discovery.",
    expected_entities: ["Post", "User", "Comment", "Tag"],
    expected_pages: ["Feed", "Profile", "Explore", "Create Post"],
  },
  {
    id: "real_08",
    category: "real_product",
    prompt: "Restaurant POS system. Staff take orders, kitchen sees queue, manager sees reports and can manage menu. Table management. Daily revenue summary.",
    expected_entities: ["Order", "MenuItem", "Table", "Staff"],
    expected_pages: ["Order Taking", "Kitchen View", "Menu Management", "Reports"],
  },
  {
    id: "real_09",
    category: "real_product",
    prompt: "HR management system. Track employees, departments, leave requests, performance reviews. HR managers approve leaves. Employees see their own data.",
    expected_entities: ["Employee", "Department", "LeaveRequest", "Review"],
    expected_pages: ["Employee Directory", "Leave Management", "Performance", "Org Chart"],
  },
  {
    id: "real_10",
    category: "real_product",
    prompt: "Event ticketing platform. Organizers create events with ticket tiers. Buyers purchase tickets with Stripe. QR codes for check-in. Organizer analytics.",
    expected_entities: ["Event", "Ticket", "Order", "Attendee"],
    expected_pages: ["Event Listing", "Event Detail", "Checkout", "Organizer Dashboard", "Check-in"],
  },

  // ── EDGE CASES — VAGUE (4) ────────────────────────────────────
  {
    id: "edge_vague_01",
    category: "edge_vague",
    prompt: "Build me an app",
    should_ask_clarification: true,
  },
  {
    id: "edge_vague_02",
    category: "edge_vague",
    prompt: "I need a website for my business",
    should_ask_clarification: true,
  },
  {
    id: "edge_vague_03",
    category: "edge_vague",
    prompt: "Make something like Airbnb but different",
    should_ask_clarification: true,
  },
  {
    id: "edge_vague_04",
    category: "edge_vague",
    prompt: "I want users to be able to do stuff with their data",
    should_ask_clarification: true,
  },

  // ── EDGE CASES — CONFLICTING (3) ─────────────────────────────
  {
    id: "edge_conflict_01",
    category: "edge_conflicting",
    prompt: "Build a completely free app with no ads that also generates $10M revenue. Everything should be unlimited for all users including free ones.",
    should_ask_clarification: true,
  },
  {
    id: "edge_conflict_02",
    category: "edge_conflicting",
    prompt: "Users should be able to delete their account and all data, but we need to keep all their data forever for compliance.",
    should_ask_clarification: true,
  },
  {
    id: "edge_conflict_03",
    category: "edge_conflicting",
    prompt: "The dashboard should only show to admin users but also show to everyone. Public and private at the same time.",
    should_ask_clarification: true,
  },

  // ── EDGE CASES — INCOMPLETE (3) ──────────────────────────────
  {
    id: "edge_incomplete_01",
    category: "edge_incomplete",
    prompt: "CRM with contacts",
    expected_entities: ["Contact"],
  },
  {
    id: "edge_incomplete_02",
    category: "edge_incomplete",
    prompt: "Blog",
    expected_entities: ["Post", "Author"],
    expected_pages: ["Home", "Post"],
  },
  {
    id: "edge_incomplete_03",
    category: "edge_incomplete",
    prompt: "E-commerce store with products and checkout",
    expected_entities: ["Product", "Order"],
    expected_pages: ["Catalog", "Checkout"],
  },
];

// ── RUN EVALUATION ───────────────────────────────────────────────
export async function runEvaluation(
  cases: EvalCase[] = EVAL_DATASET,
  concurrency = 2
): Promise<EvalReport> {
  const results: EvalResult[] = [];

  // Run in batches to avoid rate limits
  for (let i = 0; i < cases.length; i += concurrency) {
    const batch = cases.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(runSingleEval));
    results.push(...batchResults);

    // Rate limit buffer
    if (i + concurrency < cases.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return buildReport(results);
}

async function runSingleEval(evalCase: EvalCase): Promise<EvalResult> {
  const start = Date.now();

  try {
    const result = await runPipeline(evalCase.prompt);

    // Check if vague cases correctly triggered clarification
    if (evalCase.should_ask_clarification && !result.success) {
      const isClarificationRequest = result.failure_type === "vague_input" && result.clarifications_needed.length > 0;
      return {
        case_id: evalCase.id,
        success: isClarificationRequest, // Expected failure
        retries: result.total_retries,
        latency_ms: result.total_latency_ms,
        tokens_used: result.total_tokens,
        failure_type: result.failure_type,
        schema_valid: false,
        cross_layer_consistent: false,
        assumptions_count: result.assumptions_made.length,
        clarifications_count: result.clarifications_needed.length,
        repair_applied: false,
      };
    }

    let crossLayerConsistent = false;
    if (result.success && result.final_config) {
      const validation = validateCrossLayer(
        result.final_config.db,
        result.final_config.api,
        result.final_config.ui,
        result.final_config.auth,
        result.final_config.architecture
      );
      crossLayerConsistent = validation.valid;
    }

    // Check expected entities/pages coverage
    let entityCoverage = true;
    let pageCoverage = true;

    if (evalCase.expected_entities && result.final_config) {
      const modelNames = result.final_config.db.tables.map(t => t.name.toLowerCase());
      entityCoverage = evalCase.expected_entities.every(e =>
        modelNames.some(m => m.includes(e.toLowerCase()) || e.toLowerCase().includes(m))
      );
    }

    if (evalCase.expected_pages && result.final_config) {
      const pageNames = result.final_config.ui.pages.map(p => p.name.toLowerCase());
      pageCoverage = evalCase.expected_pages.every(p =>
        pageNames.some(pn => pn.includes(p.toLowerCase()) || p.toLowerCase().includes(pn))
      );
    }

    return {
      case_id: evalCase.id,
      success: result.success && entityCoverage && pageCoverage,
      retries: result.total_retries,
      latency_ms: result.total_latency_ms,
      tokens_used: result.total_tokens,
      failure_type: result.failure_type,
      schema_valid: result.success,
      cross_layer_consistent: crossLayerConsistent,
      assumptions_count: result.assumptions_made.length,
      clarifications_count: result.clarifications_needed.length,
      repair_applied: result.stages.some(s => s.repair_applied),
    };
  } catch (err) {
    return {
      case_id: evalCase.id,
      success: false,
      retries: 0,
      latency_ms: Date.now() - start,
      tokens_used: 0,
      failure_type: "api_error",
      schema_valid: false,
      cross_layer_consistent: false,
      assumptions_count: 0,
      clarifications_count: 0,
      repair_applied: false,
    };
  }
}

function buildReport(results: EvalResult[]): EvalReport {
  const total = results.length;
  const successful = results.filter(r => r.success).length;
  const repairAttempted = results.filter(r => r.repair_applied);

  const failureBreakdown: Record<string, number> = {};
  for (const r of results.filter(r => !r.success)) {
    const key = r.failure_type ?? "unknown";
    failureBreakdown[key] = (failureBreakdown[key] ?? 0) + 1;
  }

  return {
    total_cases: total,
    success_rate: Math.round((successful / total) * 100) / 100,
    avg_latency_ms: Math.round(results.reduce((s, r) => s + r.latency_ms, 0) / total),
    avg_tokens: Math.round(results.reduce((s, r) => s + r.tokens_used, 0) / total),
    avg_retries: Math.round((results.reduce((s, r) => s + r.retries, 0) / total) * 10) / 10,
    repair_success_rate: repairAttempted.length > 0
      ? Math.round((repairAttempted.filter(r => r.success).length / repairAttempted.length) * 100) / 100
      : 0,
    failure_breakdown: failureBreakdown,
    results,
  };
}

// ── COST ANALYSIS ────────────────────────────────────────────────
export function analyzeCostQualityTradeoff(report: EvalReport) {
  const GPT4O_INPUT_PER_1K = 0.0025;
  const GPT4O_OUTPUT_PER_1K = 0.01;
  const EST_INPUT_RATIO = 0.6;

  const totalCost = report.results.reduce((sum, r) => {
    const inputTokens = r.tokens_used * EST_INPUT_RATIO;
    const outputTokens = r.tokens_used * (1 - EST_INPUT_RATIO);
    return sum + (inputTokens / 1000) * GPT4O_INPUT_PER_1K + (outputTokens / 1000) * GPT4O_OUTPUT_PER_1K;
  }, 0);

  return {
    total_cost_usd: Math.round(totalCost * 10000) / 10000,
    cost_per_request_usd: Math.round((totalCost / report.total_cases) * 10000) / 10000,
    cost_per_successful_request_usd: Math.round((totalCost / report.results.filter(r => r.success).length) * 10000) / 10000,
    quality_score: report.success_rate,
    latency_quality_ratio: Math.round(report.avg_latency_ms / report.success_rate),
    recommendation: report.avg_latency_ms > 30000
      ? "Consider gpt-4o-mini for Stage 1 (intent) to reduce latency"
      : "Current model selection is optimal",
  };
}
