import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

import { MATERIAL_IMPORTS } from "./material";
import { AuthService } from "./services/auth.service";

@Component({
  selector: "ft-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ...MATERIAL_IMPORTS],
  template: `
    <mat-toolbar class="shell-toolbar">
      <a mat-button routerLink="/" class="brand-link">Родинне дерево</a>
      <span class="brand-subtitle">Простий MVP для приватного сімейного дерева</span>
      <span class="toolbar-spacer"></span>

      <nav class="shell-nav" *ngIf="auth.loaded() && auth.user(); else loginLink">
        <a mat-button routerLink="/" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active-link">Дерево</a>
        <a mat-button routerLink="/persons" routerLinkActive="active-link">Люди</a>
        <mat-chip-set>
          <mat-chip>{{ auth.user()?.email }}</mat-chip>
        </mat-chip-set>
        <button mat-stroked-button type="button" color="primary" (click)="logout()">Вийти</button>
      </nav>

      <ng-template #loginLink>
        <nav class="shell-nav">
          <a mat-button routerLink="/login" routerLinkActive="active-link">Вхід</a>
        </nav>
      </ng-template>
    </mat-toolbar>

    <main>
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [
    `
      .shell-toolbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        gap: 20px;
        backdrop-filter: blur(18px);
        border-bottom: 1px solid var(--border);
        min-height: 72px;
        padding: 0 20px;
      }

      .brand-link {
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.03em;
        text-decoration: none;
        padding-inline: 0;
      }

      .brand-subtitle {
        color: var(--muted);
        font-size: 14px;
      }

      .toolbar-spacer {
        flex: 1 1 auto;
      }

      .shell-nav {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }

      .active-link {
        color: var(--accent) !important;
      }

      @media (max-width: 920px) {
        .shell-toolbar {
          min-height: auto;
          padding-top: 12px;
          padding-bottom: 12px;
          flex-wrap: wrap;
          justify-content: flex-start;
        }

        .shell-nav {
          width: 100%;
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
