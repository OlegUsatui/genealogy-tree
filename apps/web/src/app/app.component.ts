import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

import { AuthService } from "./services/auth.service";

@Component({
  selector: "ft-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="shell-header">
      <div class="brand-block">
        <a routerLink="/persons" class="brand-link">Family Tree</a>
        <p class="brand-subtitle">Простий MVP для приватного сімейного дерева</p>
      </div>

      <nav class="shell-nav" *ngIf="auth.loaded() && auth.user(); else loginLink">
        <a routerLink="/persons" routerLinkActive="active-link">Люди</a>
        <span class="user-pill">{{ auth.user()?.email }}</span>
        <button type="button" class="btn btn-secondary" (click)="logout()">Вийти</button>
      </nav>

      <ng-template #loginLink>
        <nav class="shell-nav">
          <a routerLink="/login" routerLinkActive="active-link">Вхід</a>
        </nav>
      </ng-template>
    </header>

    <main>
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [
    `
      .shell-header {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 18px 24px;
        backdrop-filter: blur(18px);
        background: rgba(248, 243, 235, 0.82);
        border-bottom: 1px solid rgba(79, 58, 35, 0.08);
      }

      .brand-block {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .brand-link {
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.03em;
        text-decoration: none;
      }

      .brand-subtitle {
        margin: 0;
        color: var(--muted);
      }

      .shell-nav {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .shell-nav a {
        text-decoration: none;
        font-weight: 600;
      }

      .active-link {
        color: var(--accent);
      }

      .user-pill {
        border-radius: 999px;
        background: rgba(45, 34, 21, 0.06);
        padding: 8px 12px;
        color: var(--muted);
      }

      @media (max-width: 720px) {
        .shell-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .shell-nav {
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class AppComponent {
  protected readonly auth = inject(AuthService);

  constructor() {
    void this.auth.restoreSession();
  }

  protected logout(): void {
    void this.auth.logout();
  }
}

