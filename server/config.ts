import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_PATH: z.string().default("data/interviewpro.db"),
  AI_PROVIDER: z.enum(["gemini", "mock"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_MODEL: z.string().default("nova-3"),
  DEEPGRAM_LANGUAGE: z.string().default("en"),
  CLIENT_ORIGIN: z.string().optional(),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === "production";
