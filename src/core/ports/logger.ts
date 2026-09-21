export type LogValue = string | number | boolean | null;
export type LogFields = Readonly<Record<string, LogValue>>;

export interface AppLogger {
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
}
