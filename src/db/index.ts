import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { config } from "../config.js";

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
