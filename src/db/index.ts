import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { config } from "../config.js";

// Ensure the database directory exists (Render doesn't have data/ in git)
mkdirSync(dirname(config.DATABASE_URL), { recursive: true });

const sqlite = new Database(config.DATABASE_URL);

// Enable WAL mode for concurrent reads during writes
sqlite.pragma("journal_mode = WAL");
// Enable foreign keys
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
export type Db = typeof db;

export function closeDb(): void {
  sqlite.close();
}
