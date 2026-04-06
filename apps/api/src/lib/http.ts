export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function noContent(init: ResponseInit = {}): Response {
  return new Response(null, {
    ...init,
    status: init.status ?? 204,
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      {
        error: error.message,
        details: error.details ?? null,
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "Непередбачена помилка сервера";
  return json(
    {
      error: message,
    },
    { status: 500 },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Некоректне JSON-тіло запиту");
  }
}

export function applyCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "Origin");

  if (origin === "http://localhost:4200" || origin === "http://127.0.0.1:4200") {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleOptions(request: Request): Response {
  return applyCors(request, noContent());
}
