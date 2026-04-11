import type { AuthMeResponse, LoginDto, SessionUser } from "@family-tree/shared";

import { Injectable, signal, inject } from "@angular/core";
import { Router } from "@angular/router";

import { ApiService } from "./api.service";
import { awaitOne } from "./await-one";
import { LoadingOverlayService } from "./loading-overlay.service";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly loadingOverlay = inject(LoadingOverlayService);

  readonly user = signal<SessionUser | null>(null);
  readonly loaded = signal(false);

  async restoreSession(force = false): Promise<void> {
    if (this.loaded() && !force) {
      return;
    }

    this.loadingOverlay.show("auth-restore");

    try {
      const response = await awaitOne<AuthMeResponse>(this.api.get<AuthMeResponse>("/auth/me"));
      this.user.set(response.user);
    } catch {
      this.user.set(null);
    } finally {
      this.loaded.set(true);
      this.loadingOverlay.hide("auth-restore");
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

  async deleteAccount(): Promise<void> {
    await awaitOne<{ success: boolean }>(this.api.delete<{ success: boolean }>("/account"));
    this.user.set(null);
    this.loaded.set(true);
    await this.router.navigate(["/login"], {
      queryParams: {
        accountDeleted: "1",
      },
    });
  }
}
