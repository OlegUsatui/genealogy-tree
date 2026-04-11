import type { Person } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { Component, DestroyRef, effect, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";

import { MATERIAL_IMPORTS } from "./material";
import { AuthService } from "./services/auth.service";
import { LoadingOverlayService } from "./services/loading-overlay.service";
import { awaitOne } from "./services/await-one";
import { PersonsService } from "./services/persons.service";

@Component({
  selector: "ft-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ...MATERIAL_IMPORTS],
  template: `
    <header class="shell-toolbar">
      <div class="desktop-header">
        <a mat-button routerLink="/" class="brand-link desktop-brand" aria-label="Родинне дерево">
          <span class="brand-mark" aria-hidden="true">
            <img class="brand-icon" src="/favicon.svg" alt="" width="48" height="48">
          </span>
          <span class="brand-wordmark">Родинне дерево</span>
        </a>

        <nav class="desktop-nav" *ngIf="auth.loaded() && auth.user()">
          <a mat-button routerLink="/" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="active-link">Дерево</a>
          <a mat-button routerLink="/persons" routerLinkActive="active-link">Люди</a>
        </nav>

        <div class="desktop-account" *ngIf="auth.loaded() && auth.user(); else desktopGuest">
          <a
            *ngIf="auth.user()?.primaryPersonId as primaryPersonId; else desktopAccountStatic"
            [routerLink]="['/persons', primaryPersonId, 'edit']"
            class="account-link"
            aria-label="Мій профіль"
          >
            <span class="account-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="account-avatar-icon">
                <path d="M12 12.2a4.1 4.1 0 1 0-4.1-4.1 4.1 4.1 0 0 0 4.1 4.1Z"></path>
                <path d="M12 13.9c-4 0-7.2 2-7.2 4.5v1.1h14.4v-1.1c0-2.5-3.2-4.5-7.2-4.5Z"></path>
              </svg>
            </span>
            <span class="account-copy">
              <span class="account-name">{{ accountDisplayName() }}</span>
              <span class="account-email">{{ auth.user()?.email }}</span>
            </span>
          </a>

          <ng-template #desktopAccountStatic>
            <div class="account-link account-link--static">
              <span class="account-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" class="account-avatar-icon">
                  <path d="M12 12.2a4.1 4.1 0 1 0-4.1-4.1 4.1 4.1 0 0 0 4.1 4.1Z"></path>
                  <path d="M12 13.9c-4 0-7.2 2-7.2 4.5v1.1h14.4v-1.1c0-2.5-3.2-4.5-7.2-4.5Z"></path>
                </svg>
              </span>
              <span class="account-copy">
                <span class="account-name">{{ accountDisplayName() }}</span>
                <span class="account-email">{{ auth.user()?.email }}</span>
              </span>
            </div>
          </ng-template>

          <button mat-stroked-button type="button" color="primary" (click)="logout()">Вийти</button>
        </div>

        <ng-template #desktopGuest>
          <div class="desktop-guest">
            <a mat-button routerLink="/login" routerLinkActive="active-link">Вхід</a>
            <a mat-stroked-button routerLink="/users/new" routerLinkActive="active-link">Новий користувач</a>
          </div>
        </ng-template>
      </div>

      <div class="mobile-header">
        <a mat-button routerLink="/" class="brand-link mobile-brand" aria-label="Родинне дерево">
          <span class="brand-mark" aria-hidden="true">
            <img class="brand-icon" src="/favicon.svg" alt="" width="48" height="48">
          </span>
          <span class="brand-wordmark">Родинне дерево</span>
        </a>

        <button
          mat-icon-button
          type="button"
          class="menu-toggle"
          [attr.aria-expanded]="isMobileMenuOpen()"
          [attr.aria-label]="isMobileMenuOpen() ? 'Закрити меню' : 'Відкрити меню'"
          (click)="toggleMobileMenu()"
        >
          <span class="burger-icon" [class.is-open]="isMobileMenuOpen()" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
    </header>

    <div class="mobile-overlay" [class.is-open]="isMobileMenuOpen()" (click)="closeMobileMenu()">
      <div class="mobile-overlay-backdrop"></div>

      <aside class="mobile-drawer" (click)="$event.stopPropagation()">
        <div class="mobile-drawer-header">
          <div class="mobile-drawer-copy">
            <span class="mobile-drawer-kicker">Меню</span>
            <strong class="mobile-drawer-title">Навігація</strong>
          </div>

          <button type="button" class="drawer-close" aria-label="Закрити меню" (click)="closeMobileMenu()">
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <ng-container *ngIf="auth.loaded() && auth.user(); else mobileGuest">
          <nav class="mobile-nav">
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
          </nav>

          <div class="mobile-account-card">
            <span class="account-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="account-avatar-icon">
                <path d="M12 12.2a4.1 4.1 0 1 0-4.1-4.1 4.1 4.1 0 0 0 4.1 4.1Z"></path>
                <path d="M12 13.9c-4 0-7.2 2-7.2 4.5v1.1h14.4v-1.1c0-2.5-3.2-4.5-7.2-4.5Z"></path>
              </svg>
            </span>
            <span class="account-copy">
              <span class="account-name">{{ accountDisplayName() }}</span>
              <span class="account-email">{{ auth.user()?.email }}</span>
            </span>
          </div>

          <button mat-stroked-button type="button" color="primary" class="mobile-logout" (click)="logout()">Вийти</button>
        </ng-container>

        <ng-template #mobileGuest>
          <nav class="mobile-nav">
            <a mat-button routerLink="/login" routerLinkActive="active-link">Вхід</a>
            <a mat-button routerLink="/users/new" routerLinkActive="active-link">Новий користувач</a>
          </nav>
        </ng-template>
      </aside>
      </div>

    <main class="shell-main">
      <router-outlet></router-outlet>
    </main>

    <div *ngIf="loadingOverlay.active()" class="app-loader-overlay">
      <div class="app-loader-content" role="status" aria-live="polite" aria-label="Завантаження">
        <div class="app-loader-glow" aria-hidden="true"></div>
        <img class="app-loader-tree" src="/tree-loader.svg" alt="" width="220" height="220" aria-hidden="true">
        <div class="app-loader-shadow" aria-hidden="true"></div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
        height: 100dvh;
      }

      .shell-main {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        flex-direction: column;
        padding-top: 14px;
        box-sizing: border-box;
      }

      .shell-main > router-outlet {
        display: block;
        flex: 0 0 auto;
        min-height: 0;
      }

      .shell-main > router-outlet + * {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
      }

      .app-loader-overlay {
        position: fixed;
        inset: 0;
        z-index: 1400;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(15, 20, 24, 0.58);
        backdrop-filter: blur(8px);
      }

      .app-loader-content {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: min(280px, calc(100vw - 48px));
        aspect-ratio: 1;
      }

      .app-loader-glow {
        position: absolute;
        inset: 18% 18% 24%;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(166, 213, 139, 0.35), rgba(166, 213, 139, 0));
        filter: blur(10px);
        animation: loader-glow 1.7s ease-in-out infinite alternate;
      }

      .app-loader-tree {
        position: relative;
        z-index: 1;
        width: 100%;
        height: auto;
        display: block;
        transform-origin: 50% 86%;
        animation:
          loader-float 1.8s ease-in-out infinite,
          loader-sway 2.6s ease-in-out infinite;
        filter: drop-shadow(0 16px 36px rgba(8, 14, 20, 0.22));
        user-select: none;
        pointer-events: none;
      }

      .app-loader-shadow {
        position: absolute;
        bottom: 10%;
        left: 50%;
        width: 44%;
        height: 10%;
        border-radius: 999px;
        background: rgba(8, 14, 20, 0.32);
        transform: translateX(-50%);
        filter: blur(8px);
        animation: loader-shadow 1.8s ease-in-out infinite;
      }

      .shell-toolbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        min-height: 76px;
        overflow: visible;
        white-space: normal;
        backdrop-filter: blur(18px);
        border-bottom: 1px solid var(--border);
        padding: 12px clamp(14px, 2vw, 20px);
      }

      .desktop-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 16px;
        min-width: 0;
      }

      .mobile-header {
        display: none;
      }

      .mobile-overlay {
        display: none;
      }

      .desktop-brand {
        justify-self: start;
      }

      .brand-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
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

      .desktop-nav {
        display: flex;
        align-items: center;
        justify-self: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .desktop-nav > .mat-mdc-button-base {
        min-height: 42px;
      }

      .desktop-account,
      .desktop-guest {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        min-width: 0;
        flex-wrap: nowrap;
        justify-self: end;
      }

      .account-link {
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        min-width: 0;
        max-width: min(100%, 320px);
        flex-wrap: nowrap;
        padding: 8px 12px;
        border-radius: 18px;
        border: 1px solid rgba(127, 160, 200, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 251, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.28), transparent 42%);
        box-shadow: 0 10px 24px rgba(39, 44, 58, 0.05);
        text-decoration: none;
      }

      .account-link--static {
        cursor: default;
      }

      .account-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(219, 232, 247, 0.96), rgba(207, 224, 243, 0.9));
        color: #32557f;
      }

      .account-avatar-icon {
        width: 22px;
        height: 22px;
        fill: currentColor;
      }

      .account-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        min-width: 0;
        text-align: left;
      }

      .account-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }

      .account-email {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .active-link {
        color: var(--accent) !important;
      }

      @keyframes loader-float {
        0%,
        100% {
          translate: 0 6px;
        }

        50% {
          translate: 0 -2px;
        }
      }

      @keyframes loader-sway {
        0%,
        100% {
          rotate: -7deg;
          scale: 0.98;
        }

        50% {
          rotate: 7deg;
          scale: 1;
        }
      }

      @keyframes loader-shadow {
        0%,
        100% {
          transform: translateX(-50%) scaleX(0.92);
          opacity: 0.34;
        }

        50% {
          transform: translateX(-50%) scaleX(1);
          opacity: 0.2;
        }
      }

      @keyframes loader-glow {
        0% {
          opacity: 0.65;
          scale: 0.95;
        }

        100% {
          opacity: 1;
          scale: 1.08;
        }
      }

      @media (max-width: 960px) {
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

      @media (max-width: 900px) {
        .shell-toolbar {
          min-height: 88px;
          padding-top: 14px;
          padding-bottom: 14px;
        }

        .desktop-header {
          display: none;
        }

        .mobile-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 56px;
          min-width: 0;
        }

        .mobile-brand {
          min-width: 0;
          max-width: calc(100% - 58px);
          min-height: 56px;
          align-items: center;
        }

        .menu-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          flex: 0 0 auto;
          padding: 0;
          line-height: 1;
          border-radius: 16px;
          border: 1px solid rgba(39, 44, 58, 0.08);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(240, 246, 235, 0.92));
        }

        .burger-icon {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 18px;
          height: 18px;
          margin: 0;
        }

        .burger-icon span {
          display: block;
          width: 100%;
          height: 2px;
          border-radius: 999px;
          background: currentColor;
          transition: transform 160ms ease, opacity 160ms ease;
        }

        .burger-icon.is-open span:nth-child(1) {
          transform: translateY(6px) rotate(45deg);
        }

        .burger-icon.is-open span:nth-child(2) {
          opacity: 0;
        }

        .burger-icon.is-open span:nth-child(3) {
          transform: translateY(-6px) rotate(-45deg);
        }

        .mobile-overlay {
          position: fixed;
          inset: 0;
          z-index: 30;
          display: block;
          pointer-events: none;
        }

        .mobile-overlay-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(19, 36, 60, 0.34);
          backdrop-filter: blur(8px);
          opacity: 0;
          transition: opacity 220ms ease;
        }

        .mobile-drawer {
          position: absolute;
          top: 0;
          right: 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
          width: min(100vw, 380px);
          height: 100dvh;
          padding: 20px 18px calc(24px + env(safe-area-inset-bottom, 0px));
          background:
            radial-gradient(circle at top right, rgba(160, 201, 246, 0.24), transparent 28%),
            linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(237, 245, 252, 0.98));
          border-left: 1px solid rgba(59, 96, 146, 0.14);
          box-shadow: -20px 0 44px rgba(19, 36, 60, 0.14);
          transform: translateX(100%);
          transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .mobile-overlay.is-open {
          pointer-events: auto;
        }

        .mobile-overlay.is-open .mobile-overlay-backdrop {
          opacity: 1;
        }

        .mobile-overlay.is-open .mobile-drawer {
          transform: translateX(0);
        }

        .mobile-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .mobile-drawer-copy {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .mobile-drawer-kicker {
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .mobile-drawer-title {
          font-size: 22px;
          line-height: 1;
        }

        .drawer-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          padding: 0;
          border: 1px solid rgba(39, 44, 58, 0.08);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.82);
          color: var(--text);
          font: inherit;
        }

        .mobile-nav {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 8px;
          width: 100%;
        }

        .mobile-nav > .mat-mdc-button-base,
        .mobile-logout {
          width: 100%;
          justify-content: flex-start;
          min-height: 44px;
        }

      .mobile-account-card {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        padding: 12px;
        border-radius: 18px;
        border: 1px solid rgba(127, 160, 200, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 251, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.28), transparent 42%);
      }
      }

      @media (max-width: 640px) {
        .shell-toolbar {
          min-height: 84px;
        }

        .shell-main {
          padding-top: 10px;
        }

        .app-loader-overlay {
          padding: 16px;
        }

        .app-loader-content {
          width: min(220px, calc(100vw - 32px));
        }

        .brand-wordmark {
          min-height: 46px;
          white-space: normal;
          line-height: 1.1;
          overflow-wrap: anywhere;
        }

        .brand-link {
          font-size: 20px;
          min-height: 56px;
          align-items: center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .app-loader-glow,
        .app-loader-tree,
        .app-loader-shadow {
          animation: none;
        }
      }
    `,
  ],
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  private readonly personsService = inject(PersonsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly loadingOverlay = inject(LoadingOverlayService);
  private profileLoadToken = 0;

  protected readonly accountDisplayName = signal("Мій профіль");
  protected readonly isMobileMenuOpen = signal(false);

  constructor() {
    void this.auth.restoreSession();

    effect(
      () => {
        const user = this.auth.user();
        const email = user?.email ?? null;
        const primaryPersonId = user?.primaryPersonId ?? null;

        this.accountDisplayName.set(this.fallbackAccountName(email));
        this.profileLoadToken += 1;

        if (primaryPersonId) {
          const currentToken = this.profileLoadToken;
          void this.loadAccountName(primaryPersonId, email, currentToken);
        }
      },
      { allowSignalWrites: true },
    );

    effect(() => {
      if (typeof document === "undefined") {
        return;
      }

      document.body.style.overflow = this.isMobileMenuOpen() ? "hidden" : "";
    });

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.loadingOverlay.show("router-navigation");
      }

      if (event instanceof NavigationEnd) {
        this.loadingOverlay.hide("router-navigation");
        this.isMobileMenuOpen.set(false);
      }

      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.loadingOverlay.hide("router-navigation");
      }
    });
  }

  protected logout(): void {
    this.isMobileMenuOpen.set(false);
    void this.auth.logout();
  }

  protected toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((value) => !value);
  }

  protected closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  private async loadAccountName(primaryPersonId: string, email: string | null, token: number): Promise<void> {
    try {
      const person = await awaitOne<Person>(this.personsService.get(primaryPersonId));

      if (token !== this.profileLoadToken) {
        return;
      }

      this.accountDisplayName.set(this.formatPersonName(person) || this.fallbackAccountName(email));
    } catch {
      if (token !== this.profileLoadToken) {
        return;
      }

      this.accountDisplayName.set(this.fallbackAccountName(email));
    }
  }

  private formatPersonName(person: Person): string {
    return [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  }

  private fallbackAccountName(email: string | null): string {
    if (!email) {
      return "Мій профіль";
    }

    const localPart = email.split("@")[0]?.trim();

    return localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : "Мій профіль";
  }
}
