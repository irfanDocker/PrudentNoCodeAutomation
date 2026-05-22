import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().default("mysql://prudent:prudent_password@localhost:3306/prudent_automation"),
  JWT_SECRET: z.string().min(16).default("development-secret-change-me"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  ARTIFACT_DIR: z.string().default("./artifacts"),
  PUBLIC_ARTIFACT_BASE_URL: z.string().default("http://localhost:4000/artifacts")
});

export const env = envSchema.parse(process.env);

