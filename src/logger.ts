import pino, { type DestinationStream, type LoggerOptions } from "pino";
import { getConfig, isDevelopment } from "./config.ts";

const REDACT_PATHS = [
  "authorization",
  "cookie",
  "token",
  "accessToken",
  "access_token",
  "apiKey",
  "api_key",
  "clientSecret",
  "client_secret",
  "password",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.authorization",
  "*.cookie",
  "*.token",
  "*.accessToken",
  "*.access_token",
  "*.apiKey",
  "*.api_key",
  "*.clientSecret",
  "*.client_secret",
  "*.password",
];

export function createLogger(destination?: DestinationStream) {
  const config = getConfig();
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    base: {
      service: config.SERVER_NAME,
      version: config.SERVER_VERSION,
      environment: config.NODE_ENV,
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
  };

  if (destination !== undefined) {
    return pino(options, destination);
  }

  const transport = isDevelopment()
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined;

  return pino({ ...options, transport });
}

export const logger = createLogger();
