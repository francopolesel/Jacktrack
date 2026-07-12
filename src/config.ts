import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(900000),
  SEVENTEEN_TRACK_API_KEY: z.string().min(1, "SEVENTEEN_TRACK_API_KEY is required"),
  SEVENTEEN_TRACK_API_URL: z.string().url().default("https://api.17track.net/v2.4"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  FROM_EMAIL: z.string().email().default("tracking@jacktrack.app"),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
