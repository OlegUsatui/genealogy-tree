import type { SessionUser } from "@family-tree/shared";

import { HttpError, json } from "../lib/http";
import { clearSessionCookie } from "../lib/session";
import type { Env } from "../types";

export async function deleteAccount(
  request: Request,
  env: Env,
  currentUser: SessionUser,
): Promise<Response> {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
    .bind(currentUser.id)
    .first<{ id: string }>();

  if (!existing) {
    throw new HttpError(404, "Акаунт не знайдено");
  }

  await env.DB.batch([
    env.DB.prepare(
      `
        DELETE FROM relationships
        WHERE user_id = ?
          OR person1_id IN (SELECT id FROM persons WHERE user_id = ?)
          OR person2_id IN (SELECT id FROM persons WHERE user_id = ?)
      `,
    ).bind(currentUser.id, currentUser.id, currentUser.id),
    env.DB.prepare("DELETE FROM persons WHERE user_id = ?").bind(currentUser.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(currentUser.id),
  ]);

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
