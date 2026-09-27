import "dotenv/config";
import { localTestEnvironment } from "./local-environment";
Object.assign(process.env, localTestEnvironment(process.env));
for (const key of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "RESEND_API_KEY", "SENTRY_DSN"]) delete process.env[key];
export const TEST_ENV_READY = true;

for (const key of Object.keys(process.env)) if (/^SEED_.*_PASSWORD$/.test(key)) delete process.env[key];
