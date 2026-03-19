import { resolve } from "node:path";
import { initDb } from "../src/db.ts";
import { createChatService } from "../src/features/chat/service.ts";
import type { SSEEvent } from "../src/features/chat/types.ts";

interface EvalCase {
  name: string;
  input: string;
  expectedOutcome: string | string[];
  expectedSources?: string[];
}

interface EvalResult {
  name: string;
  pass: boolean;
  expectedOutcome: string | string[];
  actualOutcome: string;
  expectedSources?: string[];
  actualSources: string[];
  escalated: boolean;
  text: string;
  error?: string;
}

const FOLLOWUP_PLEASANTRIES = [
  "anything else",
  "help you with",
  "help with anything",
  "how can i help",
  "what can i help",
  "let me know if",
  "feel free to ask",
  "have any other questions",
  "any other questions",
  "connect you with",
  "would you like me to",
  "did the",
  "resolve it",
  "did that help",
  "does that help",
];

function endsWithClarifyingQuestion(text: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith("?")) return false;
  // Extract the last sentence/question
  const lastQuestion = trimmed
    .slice(trimmed.lastIndexOf("\n") + 1)
    .toLowerCase();
  // Ignore generic follow-up pleasantries — those aren't clarifying questions
  return !FOLLOWUP_PLEASANTRIES.some((p) => lastQuestion.includes(p));
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
  } else if (endsWithClarifyingQuestion(text)) {
    outcome = "clarify";
  } else if (hadSearch && sources.length > 0) {
    outcome = "answer";
  } else {
    // No search or no sources — could be a greeting (answer) or decline
    const lower = text.toLowerCase();
    if (
      lower.includes("jumbo88-related") ||
      lower.includes("can only help with") ||
      lower.includes("i'm not able to") ||
      lower.includes("i cannot help") ||
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

    const acceptable = Array.isArray(evalCase.expectedOutcome)
      ? evalCase.expectedOutcome
      : [evalCase.expectedOutcome];
    let pass = acceptable.includes(outcome);

    if (pass && evalCase.expectedSources) {
      // At least one expected source must appear in actual sources
      const hasAnyExpected = evalCase.expectedSources.some((expected) =>
        sources.some((s) => s.includes(expected)),
      );
      if (!hasAnyExpected) pass = false;
    }

    return {
      name: evalCase.name,
      pass,
      expectedOutcome: evalCase.expectedOutcome,
      actualOutcome: outcome,
      expectedSources: evalCase.expectedSources,
      actualSources: sources,
      escalated,
      text: text.slice(0, 500),
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
  initDb();

  const casesPath = resolve(import.meta.dirname as string, "cases.json");
  const allCases: EvalCase[] = await Bun.file(casesPath).json();

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
    if (result.pass) {
      console.log("PASS");
    } else {
      console.log(
        `FAIL (expected=${result.expectedOutcome}, got=${result.actualOutcome})`,
      );
      console.log(`    text: ${result.text}`);
      console.log(`    sources: ${JSON.stringify(result.actualSources)}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`\n${passed}/${results.length} passed, ${failed} failed`);

  const resultsPath = resolve(import.meta.dirname as string, "results.json");
  await Bun.write(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${resultsPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Eval runner error:", err);
  process.exit(1);
});
