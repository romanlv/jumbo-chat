import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { createChatService } from "./features/chat/service.ts";
import { LibSQLVectorStore } from "./features/knowledge/vector-store.ts";
import { getDb } from "./lib/db.ts";

export function initChatService() {
  const vectorStore = new LibSQLVectorStore(getDb());
  return createChatService({ vectorStore });
}

async function sendMessage(
  chatService: ReturnType<typeof createChatService>,
  message: string,
  sessionId: string | undefined,
  verbosity: number,
): Promise<{ sessionId: string; escalated: boolean }> {
  const session = await chatService.getOrCreateSession(sessionId);
  const events = chatService.processMessage(session.id, message);

  let resultSessionId = session.id;
  let escalated = false;

  for await (const event of events) {
    if (event.type === "text-delta") {
      process.stdout.write(event.delta);
    } else if (event.type === "tool-call" && verbosity >= 1) {
      if (verbosity >= 2) {
        console.error(`\n[tool] ${event.name}(${JSON.stringify(event.args)})`);
      } else {
        const summary = Object.values(event.args).join(", ");
        console.error(`\n[tool] ${event.name}("${summary}")`);
      }
    } else if (event.type === "tool-result" && verbosity >= 2) {
      console.error(`[result] ${event.name}: ${JSON.stringify(event.result)}`);
    } else if (event.type === "metadata") {
      resultSessionId = event.sessionId;
      escalated = event.escalated;

      process.stdout.write("\n");

      if (escalated) {
        console.log(`\nEscalated: ${event.reason ?? "unknown reason"}`);
      }

      if (event.sources.length > 0) {
        console.log("\nSources:");
        const seen = new Set<string>();
        for (const s of event.sources) {
          if (seen.has(s.sourceUrl)) continue;
          seen.add(s.sourceUrl);
          console.log(`- ${s.title} (${s.sourceUrl})`);
        }
      }
    }
  }

  return { sessionId: resultSessionId, escalated };
}

async function repl(
  chatService: ReturnType<typeof createChatService>,
  verbosity: number,
) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let sessionId: string | undefined;

  console.log("Jumbo88 Support Chat (type /quit to exit)\n");

  const prompt = () => {
    rl.question("You: ", async (input) => {
      const trimmed = input.trim();
      if (trimmed === "/quit") {
        rl.close();
        return;
      }
      if (!trimmed) {
        prompt();
        return;
      }

      const result = await sendMessage(
        chatService,
        trimmed,
        sessionId,
        verbosity,
      );
      sessionId = result.sessionId;
      console.log();
      prompt();
    });
  };

  prompt();
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      session: { type: "string", short: "s" },
      interactive: { type: "boolean", short: "i", default: false },
      verbose: { type: "boolean", short: "v", multiple: true },
    },
    allowPositionals: true,
  });

  const verbosity = Array.isArray(values.verbose)
    ? values.verbose.filter(Boolean).length
    : values.verbose
      ? 1
      : 0;

  const chatService = initChatService();

  if (values.interactive) {
    await repl(chatService, verbosity);
    return;
  }

  const message = positionals.join(" ");
  if (!message) {
    console.error("Usage: bun run cli <message>");
    console.error("       bun run cli -i");
    process.exit(1);
  }

  const result = await sendMessage(
    chatService,
    message,
    values.session,
    verbosity,
  );
  console.log(`\nsession: ${result.sessionId}`);
}

const isDirectRun =
  process.argv[1] &&
  import.meta.filename &&
  resolve(process.argv[1]) === resolve(import.meta.filename);

if (isDirectRun) {
  main().catch((err) => {
    console.error("CLI error:", err);
    process.exit(1);
  });
}
