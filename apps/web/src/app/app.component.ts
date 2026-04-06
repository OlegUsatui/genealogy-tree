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
      <a mat-button routerLink="/" class="brand-link" aria-label="Родинне дерево">
        <span class="brand-mark" aria-hidden="true">
          <img class="brand-icon" src="/favicon.svg" alt="" width="48" height="48">
        </span>
        <span class="brand-wordmark">Родинне дерево</span>
      </a>
      <span class="toolbar-spacer"></span>

      <nav class="shell-nav" *ngIf="auth.loaded() && auth.user(); else loginLink">
        <a mat-button routerLink="/" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active-link">Дерево</a>
        <a mat-button routerLink="/persons" routerLinkActive="active-link">Люди</a>
        <a
          mat-button
          *ngIf="auth.user()?.primaryPersonId as primaryPersonId"
          [routerLink]="['/persons', primaryPersonId, 'edit']"
          routerLinkActive="active-link"
        >
          Мій профіль
        </a>
        <mat-chip-set>
          <mat-chip>{{ auth.user()?.email }}</mat-chip>
        </mat-chip-set>
        <button mat-stroked-button type="button" color="primary" (click)="logout()">Вийти</button>
      </nav>

      <ng-template #loginLink>
        <nav class="shell-nav">
          <a mat-button routerLink="/login" routerLinkActive="active-link">Вхід</a>
          <a mat-button routerLink="/users/new" routerLinkActive="active-link">Новий користувач</a>
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
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 54px;
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1;
        text-decoration: none;
        padding-inline: 0;
      }

      .brand-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 54px;
        height: 54px;
        border-radius: 18px;
        border: 1px solid rgba(39, 44, 58, 0.08);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(240, 246, 235, 0.92));
        box-shadow: 0 10px 24px rgba(39, 44, 58, 0.08);
      }

      .brand-icon {
        display: block;
        width: 48px;
        height: 48px;
        flex: 0 0 auto;
        filter: drop-shadow(0 6px 10px rgba(39, 44, 58, 0.1));
      }

      .brand-wordmark {
        display: inline-flex;
        align-items: center;
        min-height: 54px;
        white-space: nowrap;
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

        .brand-link {
          font-size: 22px;
          gap: 4px;
          min-height: 46px;
        }

        .brand-mark {
          width: 46px;
          height: 46px;
          border-radius: 14px;
        }

        .brand-icon {
          width: 40px;
          height: 40px;
        }

        .brand-wordmark {
          min-height: 46px;
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
