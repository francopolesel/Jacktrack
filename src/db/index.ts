import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import { config } from "../config.js";

const pgClient = postgres(config.DATABASE_URL, { prepare: false });

export const db = drizzle(pgClient, { schema });
export { schema };
export type Db = typeof db;

export async function closeDb(): Promise<void> {
  await pgClient.end();
}
