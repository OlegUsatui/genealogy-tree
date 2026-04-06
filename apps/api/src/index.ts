import type { SessionUser } from "@family-tree/shared";

import { deleteAccount } from "./routes/account";
import {
  createPerson,
  deletePerson,
  getDirectoryPerson,
  getPerson,
  getPersons,
  importDirectoryPerson,
  updatePerson,
} from "./routes/persons";
import { createRelationship, deleteRelationship, getRelationships } from "./routes/relationships";
import { getTree } from "./routes/tree";
import { login, logout, me } from "./routes/auth";
import { searchPersons, searchRegistrationPersons } from "./routes/search";
import { createUser } from "./routes/users";
import { applyCors, errorResponse, handleOptions, HttpError, json } from "./lib/http";
import { readSessionUser } from "./lib/session";
import type { Env } from "./types";

const protectedPrefixes = [
  "/api/account",
  "/api/persons",
  "/api/directory",
  "/api/relationships",
  "/api/tree",
  "/api/search",
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return handleOptions(request);
      }

      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";

      if (!env.SESSION_SECRET) {
        throw new HttpError(500, "SESSION_SECRET не налаштований");
      }

      const currentUser = requiresAuth(pathname) ? await readSessionUser(request, env) : null;

      if (requiresAuth(pathname) && !currentUser) {
        throw new HttpError(401, "Потрібна авторизація");
      }

      const response = await routeRequest(request, env, url, pathname, currentUser);
      return applyCors(request, response);
    } catch (error) {
      return applyCors(request, errorResponse(error));
    }
  },
};

async function routeRequest(
  request: Request,
  env: Env,
  url: URL,
  pathname: string,
  currentUser: SessionUser | null,
): Promise<Response> {
  if (request.method === "GET" && pathname === "/api/health") {
    return json({ ok: true });
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    return login(request, env);
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    return logout(request, env);
  }

  if (request.method === "GET" && pathname === "/api/auth/me") {
    return me(request, env);
  }

  if (request.method === "DELETE" && pathname === "/api/account") {
    return deleteAccount(request, env, requireAuthenticatedUser(currentUser));
  }

  if (request.method === "POST" && pathname === "/api/users") {
    return createUser(request, env);
  }

  if (request.method === "GET" && pathname === "/api/signup/persons") {
    return searchRegistrationPersons(url, env);
  }

  if (request.method === "GET" && pathname === "/api/persons") {
    return getPersons(env, requireAuthenticatedUser(currentUser));
  }

  const directoryPersonMatch = pathname.match(/^\/api\/directory\/persons\/([^/]+)$/);

  if (directoryPersonMatch && request.method === "GET") {
    return getDirectoryPerson(env, decodeURIComponent(directoryPersonMatch[1]));
  }

  const directoryPersonImportMatch = pathname.match(/^\/api\/directory\/persons\/([^/]+)\/import$/);

  if (directoryPersonImportMatch && request.method === "POST") {
    return importDirectoryPerson(
      env,
      requireAuthenticatedUser(currentUser),
      decodeURIComponent(directoryPersonImportMatch[1]),
    );
  }

  if (request.method === "POST" && pathname === "/api/persons") {
    return createPerson(request, env, requireAuthenticatedUser(currentUser));
  }

  const personMatch = pathname.match(/^\/api\/persons\/([^/]+)$/);

  if (personMatch) {
    const personId = decodeURIComponent(personMatch[1]);

    if (request.method === "GET") {
      return getPerson(env, requireAuthenticatedUser(currentUser), personId);
    }

    if (request.method === "PATCH") {
      return updatePerson(request, env, requireAuthenticatedUser(currentUser), personId);
    }

    if (request.method === "DELETE") {
      return deletePerson(env, requireAuthenticatedUser(currentUser), personId);
    }
  }

  if (request.method === "GET" && pathname === "/api/relationships") {
    return getRelationships(url, env, requireAuthenticatedUser(currentUser));
  }

  if (request.method === "POST" && pathname === "/api/relationships") {
    return createRelationship(request, env, requireAuthenticatedUser(currentUser));
  }

  const relationshipMatch = pathname.match(/^\/api\/relationships\/([^/]+)$/);

  if (relationshipMatch && request.method === "DELETE") {
    return deleteRelationship(env, requireAuthenticatedUser(currentUser), decodeURIComponent(relationshipMatch[1]));
  }

  if (request.method === "GET" && pathname === "/api/search") {
    return searchPersons(url, env, requireAuthenticatedUser(currentUser));
  }

  const treeMatch = pathname.match(/^\/api\/tree\/([^/]+)$/);

  if (treeMatch && request.method === "GET") {
    return getTree(url, env, requireAuthenticatedUser(currentUser), decodeURIComponent(treeMatch[1]));
  }

  throw new HttpError(404, "Маршрут не знайдено");
}

function requiresAuth(pathname: string): boolean {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function requireAuthenticatedUser(user: SessionUser | null): SessionUser {
  if (!user) {
    throw new HttpError(401, "Потрібна авторизація");
  }

  return user;
}
