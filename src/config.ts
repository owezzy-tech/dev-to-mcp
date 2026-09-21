import { z } from "zod";

const optionalUrl = z
  .string()
  .min(1)
  .optional()
  .refine(
    (value) => value === undefined || URL.canParse(value),
    "must be a valid URL",
  );

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SERVER_NAME: z.string().default("dev-to-mcp"),
  SERVER_VERSION: z.string().default("1.0.0"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  DATABASE_URL: optionalUrl,
  REDIS_URL: optionalUrl,

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_OAUTH_SCOPES: z.string().default("read:user user:email"),

  MCP_BEARER_TOKEN: z.string().min(16).optional(),
  FOREM_API_KEY: z.string().min(1).optional(),
  FOREM_API_VERSION: z.string().default("v1"),

  EMBEDDING_BASE_URL: optionalUrl,
  EMBEDDING_API_KEY: z.string().min(1).optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),

  TYPESAFE_BASE_URL: optionalUrl,
  TYPESAFE_API_KEY: z.string().min(1).optional(),
  TYPESAFE_MODEL: z.string().default("jev-latest"),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MAX_REQUEST_BYTES: z.coerce.number().int().positive().default(262_144),
  DASHBOARD_SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_600),
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | undefined;

export function getConfig(): Config {
  if (cached === undefined) {
    const parsed = configSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("❌ Invalid environment configuration:", parsed.error);
      process.exit(1);
    }
    cached = parsed.data;
  }
  return cached;
}

export function resetConfigCache(): void {
  cached = undefined;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === "development";
}
