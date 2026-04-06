import type { LoginDto, SessionUser } from "@family-tree/shared";

import { HttpError, json, readJson } from "../lib/http";
import { verifyPassword } from "../lib/password";
import { clearSessionCookie, createSessionCookie, createSessionToken, readSessionUser } from "../lib/session";
import type { Env } from "../types";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
};

export async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson<LoginDto>(request);
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    throw new HttpError(400, "Поля email і password є обов’язковими");
  }

  const user = await env.DB.prepare(
    "SELECT id, email, password_hash FROM users WHERE email = ?",
  )
    .bind(email)
    .first<UserRow>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, "Невірний email або пароль");
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
  };
  const token = await createSessionToken(sessionUser, env);

  return json(
    {
      user: sessionUser,
    },
    {
      status: 200,
      headers: {
        "set-cookie": createSessionCookie(request, env, token),
      },
    },
  );
}

export async function logout(request: Request, env: Env): Promise<Response> {
  return json(
    {
      success: true,
    },
    {
      headers: {
        "set-cookie": clearSessionCookie(request, env),
      },
    },
  );
}

export async function me(request: Request, env: Env): Promise<Response> {
  const user = await readSessionUser(request, env);

  return json({
    user,
  });
}
