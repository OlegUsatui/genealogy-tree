export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  SESSION_COOKIE_NAME?: string;
}

export type DbNullable<T> = T | null;

