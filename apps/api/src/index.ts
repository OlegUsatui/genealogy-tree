import { deletePerson, getPerson, getPersons, createPerson, updatePerson } from "./routes/persons";
import { createRelationship, deleteRelationship, getRelationships } from "./routes/relationships";
import { getTree } from "./routes/tree";
import { login, logout, me } from "./routes/auth";
import { searchPersons } from "./routes/search";
import { applyCors, errorResponse, handleOptions, HttpError, json } from "./lib/http";
import { readSessionUser } from "./lib/session";
import type { Env } from "./types";

const protectedPrefixes = [
  "/api/persons",
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
        throw new HttpError(500, "SESSION_SECRET is not configured");
      }

      if (requiresAuth(pathname)) {
        const user = await readSessionUser(request, env);

        if (!user) {
          throw new HttpError(401, "Unauthorized");
        }
      }

      const response = await routeRequest(request, env, url, pathname);
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

  if (request.method === "GET" && pathname === "/api/persons") {
    return getPersons(env);
  }

  if (request.method === "POST" && pathname === "/api/persons") {
    return createPerson(request, env);
  }

  const personMatch = pathname.match(/^\/api\/persons\/([^/]+)$/);

  if (personMatch) {
    const personId = decodeURIComponent(personMatch[1]);

    if (request.method === "GET") {
      return getPerson(env, personId);
    }

    if (request.method === "PATCH") {
      return updatePerson(request, env, personId);
    }

    if (request.method === "DELETE") {
      return deletePerson(env, personId);
    }
  }

  if (request.method === "GET" && pathname === "/api/relationships") {
    return getRelationships(url, env);
  }

  if (request.method === "POST" && pathname === "/api/relationships") {
    return createRelationship(request, env);
  }

  const relationshipMatch = pathname.match(/^\/api\/relationships\/([^/]+)$/);

  if (relationshipMatch && request.method === "DELETE") {
    return deleteRelationship(env, decodeURIComponent(relationshipMatch[1]));
  }

  if (request.method === "GET" && pathname === "/api/search") {
    return searchPersons(url, env);
  }

  const treeMatch = pathname.match(/^\/api\/tree\/([^/]+)$/);

  if (treeMatch && request.method === "GET") {
    return getTree(url, env, decodeURIComponent(treeMatch[1]));
  }

  throw new HttpError(404, "Route not found");
}

function requiresAuth(pathname: string): boolean {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
