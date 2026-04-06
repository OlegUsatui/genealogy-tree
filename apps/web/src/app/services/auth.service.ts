import type { AuthMeResponse, LoginDto, SessionUser } from "@family-tree/shared";

import { Injectable, signal, inject } from "@angular/core";
import { Router } from "@angular/router";

import { ApiService } from "./api.service";
import { awaitOne } from "./await-one";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly user = signal<SessionUser | null>(null);
  readonly loaded = signal(false);

  async restoreSession(force = false): Promise<void> {
    if (this.loaded() && !force) {
      return;
    }

    try {
      const response = await awaitOne<AuthMeResponse>(this.api.get<AuthMeResponse>("/auth/me"));
      this.user.set(response.user);
    } catch {
      this.user.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async login(payload: LoginDto): Promise<void> {
    const response = await awaitOne<{ user: SessionUser }>(
      this.api.post<{ user: SessionUser }>("/auth/login", payload),
    );
    this.user.set(response.user);
    this.loaded.set(true);
  }

  async logout(): Promise<void> {
    try {
      await awaitOne<{ success: boolean }>(this.api.post<{ success: boolean }>("/auth/logout", {}));
    } finally {
      this.user.set(null);
      this.loaded.set(true);
      await this.router.navigateByUrl("/login");
    }
  }
}
