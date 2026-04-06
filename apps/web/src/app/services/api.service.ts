import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = resolveApiBaseUrl();

  get<T>(path: string, params?: Record<string, string | number | undefined>) {
    return this.http.get<T>(this.buildUrl(path), {
      params: buildParams(params),
      withCredentials: true,
    });
  }

  post<T>(path: string, body: unknown) {
    return this.http.post<T>(this.buildUrl(path), body, {
      withCredentials: true,
    });
  }

  patch<T>(path: string, body: unknown) {
    return this.http.patch<T>(this.buildUrl(path), body, {
      withCredentials: true,
    });
  }

  delete<T>(path: string) {
    return this.http.delete<T>(this.buildUrl(path), {
      withCredentials: true,
    });
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

function resolveApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:8787/api";
  }

  const { protocol, hostname, port } = window.location;

  if (hostname === "localhost" && port === "4200") {
    return `${protocol}//${hostname}:8787/api`;
  }

  if (hostname === "127.0.0.1" && port === "4200") {
    return `${protocol}//${hostname}:8787/api`;
  }

  return "/api";
}

function buildParams(params?: Record<string, string | number | undefined>): HttpParams | undefined {
  if (!params) {
    return undefined;
  }

  let httpParams = new HttpParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      httpParams = httpParams.set(key, String(value));
    }
  }

  return httpParams;
}
