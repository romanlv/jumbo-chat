import { type Client, createClient } from "@libsql/client";
import { config } from "../config.ts";

let client: Client | null = null;

export function getDb(): Client {
  if (!client) {
    client = createClient({
      url: config.db.url,
      authToken: config.db.authToken,
    });
  }
  return client;
}

export function resetDb(): void {
  client?.close();
  client = null;
}
