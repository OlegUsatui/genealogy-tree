import type { SessionUser } from "@family-tree/shared";

import type { Env } from "../types";

const encoder = new TextEncoder();
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

interface SessionPayload extends SessionUser {
  expiresAt: number;
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const result = new Map<string, string>();

  for (const entry of header.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");

    if (!rawName || rawValue.length === 0) {
      continue;
    }

    result.set(rawName, rawValue.join("="));
  }

  return result;
}

export async function createSessionToken(user: SessionUser, env: Env): Promise<string> {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + sessionLifetimeSeconds * 1000,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await sign(encodedPayload, env.SESSION_SECRET);
  return `${encodedPayload}.${signature}`;
}

export async function readSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const cookieName = env.SESSION_COOKIE_NAME ?? "ft_session";
  const token = parseCookies(request).get(cookieName);

  if (!token) {
    return null;
  }

  const [encodedPayload, receivedSignature] = token.split(".");

  if (!encodedPayload || !receivedSignature) {
    return null;
  }

  const expectedSignature = await sign(encodedPayload, env.SESSION_SECRET);

  if (receivedSignature !== expectedSignature) {
    return null;
  }

  let payload: SessionPayload;

  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;
  } catch {
    return null;
  }

  if (payload.expiresAt <= Date.now()) {
    return null;
  }

  const user = await env.DB.prepare(
    "SELECT id, email, primary_person_id FROM users WHERE id = ?",
  )
    .bind(payload.id)
    .first<{ id: string; email: string; primary_person_id: string | null }>();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    primaryPersonId: user.primary_person_id,
  };
}

export function createSessionCookie(request: Request, env: Env, token: string): string {
  return serializeCookie(request, env, token, sessionLifetimeSeconds);
}

export function clearSessionCookie(request: Request, env: Env): string {
  return serializeCookie(request, env, "", 0);
}

function serializeCookie(request: Request, env: Env, value: string, maxAge: number): string {
  const url = new URL(request.url);
  const cookieName = env.SESSION_COOKIE_NAME ?? "ft_session";
  const parts = [
    `${cookieName}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (url.protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}
