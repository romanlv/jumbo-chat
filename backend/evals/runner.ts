import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createChatService } from "../src/features/chat/service.ts";
import type { SSEEvent } from "../src/features/chat/types.ts";

interface EvalCase {
  name: string;
  input: string;
  expectedOutcome: "answer" | "escalate" | "decline";
  expectedSources?: string[];
}

interface EvalResult {
  name: string;
  pass: boolean;
  expectedOutcome: string;
  actualOutcome: string;
  expectedSources?: string[];
  actualSources: string[];
  escalated: boolean;
  text: string;
  error?: string;
}

function determineOutcome(events: SSEEvent[]): {
  outcome: string;
  sources: string[];
  escalated: boolean;
  text: string;
} {
  let text = "";
  let escalated = false;
  const sources: string[] = [];
  let hadSearch = false;

  for (const event of events) {
    if (event.type === "text-delta") {
      text += event.delta;
    } else if (
      event.type === "tool-call" &&
      event.name === "search_knowledge_base"
    ) {
      hadSearch = true;
    } else if (
      event.type === "tool-call" &&
      event.name === "escalate_to_human"
    ) {
      escalated = true;
    } else if (event.type === "metadata") {
      escalated = event.escalated;
      for (const s of event.sources) {
        if (!sources.includes(s.sourceUrl)) {
          sources.push(s.sourceUrl);
        }
      }
    }
  }

  let outcome: string;
  if (escalated) {
    outcome = "escalate";
  } else if (hadSearch && sources.length > 0) {
    outcome = "answer";
  } else {
    // No search or no sources — could be a greeting (answer) or decline
    const lower = text.toLowerCase();
    if (
      lower.includes("jumbo88-related") ||
      lower.includes("can only help with") ||
      lower.includes("not able to") ||
      lower.includes("cannot") ||
      lower.includes("can't share") ||
      lower.includes("can't ignore") ||
      lower.includes("politely decline") ||
      lower.includes("i'm unable to")
    ) {
      outcome = "decline";
    } else {
      outcome = "answer";
    }
  }

  return { outcome, sources, escalated, text };
}

async function runCase(
  chatService: ReturnType<typeof createChatService>,
  evalCase: EvalCase,
): Promise<EvalResult> {
  try {
    const session = await chatService.getOrCreateSession();
    const events: SSEEvent[] = [];

    for await (const event of chatService.processMessage(
      session.id,
      evalCase.input,
    )) {
      events.push(event);
    }

    const { outcome, sources, escalated, text } = determineOutcome(events);

    let pass = outcome === evalCase.expectedOutcome;

    if (pass && evalCase.expectedSources) {
      for (const expected of evalCase.expectedSources) {
        if (!sources.some((s) => s.includes(expected))) {
          pass = false;
        }
      }
    }

    return {
      name: evalCase.name,
      pass,
      expectedOutcome: evalCase.expectedOutcome,
      actualOutcome: outcome,
      expectedSources: evalCase.expectedSources,
      actualSources: sources,
      escalated,
      text: text.slice(0, 200),
    };
  } catch (err) {
    return {
      name: evalCase.name,
      pass: false,
      expectedOutcome: evalCase.expectedOutcome,
      actualOutcome: "error",
      actualSources: [],
      escalated: false,
      text: "",
      error: String(err),
    };
  }
}

async function main() {
  const casesPath = resolve(import.meta.dirname as string, "cases.json");
  const allCases: EvalCase[] = JSON.parse(readFileSync(casesPath, "utf-8"));

  const filter = process.argv[2];
  const cases = filter
    ? allCases.filter((c) => c.name.includes(filter))
    : allCases;

  if (cases.length === 0) {
    console.error(`No cases matching "${filter}"`);
    process.exit(1);
  }

  const chatService = createChatService();

  console.log(`Running ${cases.length} eval cases...\n`);

  const results: EvalResult[] = [];
  for (const evalCase of cases) {
    process.stdout.write(`  ${evalCase.name}... `);
    const result = await runCase(chatService, evalCase);
    results.push(result);
    console.log(
      result.pass
        ? "PASS"
        : `FAIL (expected=${result.expectedOutcome}, got=${result.actualOutcome})`,
    );
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`\n${passed}/${results.length} passed, ${failed} failed`);

  const resultsPath = resolve(import.meta.dirname as string, "results.json");
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${resultsPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Eval runner error:", err);
  process.exit(1);
});
