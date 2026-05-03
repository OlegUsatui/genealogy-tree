import type { Person } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

import { formatPersonDisplayName } from "../lib/person-name";
import { buildPhotoInitials, isSupportedPhotoUrl } from "../lib/photo";
import { MATERIAL_IMPORTS } from "../material";

@Component({
  selector: "app-person-side-panel",
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  template: `
    <ng-container *ngIf="person as person">
      <div class="person-side-panel-backdrop" (click)="close.emit()"></div>

      <aside class="person-side-panel" (click)="$event.stopPropagation()">
        <div class="person-side-panel-header">
          <div class="person-side-panel-copy">
            <span class="person-side-panel-kicker">{{ contextLabel || "Профіль людини" }}</span>
            <h2>{{ displayName(person) }}</h2>
            <p class="muted">{{ person.biography || "Біографія ще не додана." }}</p>
          </div>

          <button type="button" class="person-side-panel-close" aria-label="Закрити" (click)="close.emit()">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div class="person-side-panel-top-actions" aria-label="Навігація профілю">
          <button
            type="button"
            class="person-top-action person-top-action--primary"
            aria-label="Відкрити профіль"
            title="Профіль"
            (click)="openProfile.emit()"
          >
            <svg viewBox="0 0 24 24" class="person-top-action-icon" aria-hidden="true">
              <path
                d="M12 12.25a4.13 4.13 0 1 0-4.12-4.13A4.13 4.13 0 0 0 12 12.25Zm0 2.25c-3.13 0-5.75 1.58-6.88 4.13a1 1 0 0 0 .91 1.37h11.94a1 1 0 0 0 .91-1.37C17.75 16.08 15.13 14.5 12 14.5Z"
              />
            </svg>
          </button>

          <button
            type="button"
            class="person-top-action"
            aria-label="Відкрити дерево"
            title="Дерево"
            (click)="openTree.emit()"
          >
            <svg viewBox="0 0 24 24" class="person-top-action-icon" aria-hidden="true">
              <circle cx="12" cy="7" r="3.25"></circle>
              <circle cx="8.1" cy="10.2" r="2.9"></circle>
              <circle cx="15.9" cy="10.2" r="2.9"></circle>
              <circle cx="12" cy="12.4" r="3.4"></circle>
              <path d="M11.1 14.6h1.8V21h-1.8z"></path>
              <path d="M9.2 19.9h5.6v1.35H9.2z"></path>
            </svg>
          </button>

          <button
            type="button"
            class="person-top-action"
            aria-label="Відкрити мережу"
            title="Мережа"
            (click)="openGraph.emit()"
          >
            <svg viewBox="0 0 24 24" class="person-top-action-icon" aria-hidden="true">
              <path
                d="M12 3.25A2.75 2.75 0 1 1 9.25 6 2.75 2.75 0 0 1 12 3.25Zm-6 10A2.75 2.75 0 1 1 3.25 16 2.75 2.75 0 0 1 6 13.25Zm12 0A2.75 2.75 0 1 1 15.25 16 2.75 2.75 0 0 1 18 13.25Zm-6-8.25a1 1 0 1 0 1 1 1 1 0 0 0-1-1Zm-6 10a1 1 0 1 0 1 1 1 1 0 0 0-1-1Zm12 0a1 1 0 1 0 1 1 1 1 0 0 0-1-1Zm-5.27-6.58 3.08 5.08a.88.88 0 1 0 1.5-.91l-3.08-5.08a.88.88 0 0 0-1.5.91Zm-1.46 0a.88.88 0 0 0-1.5-.91L6.69 12.6a.88.88 0 0 0 1.5.91Z"
              />
            </svg>
          </button>
        </div>

        <div class="person-side-panel-body">
          <section class="person-hero-card">
            <div class="person-photo-shell">
              <img *ngIf="renderablePhotoUrl(person); else photoFallback" [src]="renderablePhotoUrl(person)!" alt="Фото людини" class="person-photo">
              <ng-template #photoFallback>
                <div class="person-photo-fallback">{{ photoInitials(person) }}</div>
              </ng-template>
            </div>

            <div class="person-hero-meta">
              <div class="person-chip-row">
                <span class="person-chip">{{ genderLabel(person.gender) }}</span>
                <span class="person-chip">{{ livingStatusLabel(person) }}</span>
              </div>
              <p class="muted person-hero-subtitle">{{ person.maidenName ? "Дівоче прізвище: " + person.maidenName : "Додаткові дані можна редагувати у профілі." }}</p>
            </div>
          </section>

          <section class="person-info-section">
            <h3>Основні дані</h3>
            <div class="person-info-grid">
              <article class="person-info-card">
                <span>Ім’я</span>
                <strong>{{ person.firstName || "—" }}</strong>
              </article>
              <article class="person-info-card">
                <span>Прізвище</span>
                <strong>{{ person.lastName || "—" }}</strong>
              </article>
              <article class="person-info-card">
                <span>По батькові / друге ім’я</span>
                <strong>{{ person.middleName || "—" }}</strong>
              </article>
              <article class="person-info-card">
                <span>Дівоче прізвище</span>
                <strong>{{ person.maidenName || "—" }}</strong>
              </article>
              <article class="person-info-card">
                <span>Дата народження</span>
                <strong>{{ person.birthDate || "—" }}</strong>
              </article>
              <article class="person-info-card">
                <span>Дата смерті</span>
                <strong>{{ person.deathDate || "—" }}</strong>
              </article>
              <article class="person-info-card">
                <span>Місце народження</span>
                <strong>{{ person.birthPlace || "—" }}</strong>
              </article>
              <article class="person-info-card">
                <span>Місце смерті</span>
                <strong>{{ person.deathPlace || "—" }}</strong>
              </article>
            </div>
          </section>

          <section class="person-actions-section">
            <h3>Додати родича</h3>
            <div class="person-action-grid">
              <button mat-stroked-button type="button" (click)="addParent.emit()">Батько / матір</button>
              <button mat-stroked-button type="button" (click)="addChild.emit()">Дитина</button>
              <button mat-stroked-button type="button" (click)="addSpouse.emit()">Партнер / партнерка</button>
            </div>
          </section>
        </div>
      </aside>
    </ng-container>
  `,
  styles: [
    `
      .person-side-panel-backdrop {
        position: absolute;
        inset: 0;
        z-index: 4;
        background: rgba(18, 31, 47, 0.28);
        backdrop-filter: blur(4px);
      }

      .person-side-panel {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 5;
        width: min(420px, calc(100vw - 24px));
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 18px;
        overflow: auto;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.2), transparent 42%);
        border-right: 1px solid rgba(127, 160, 200, 0.18);
        box-shadow: 24px 0 60px rgba(17, 31, 46, 0.18);
        animation: person-side-panel-enter 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .person-side-panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .person-side-panel-copy {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .person-side-panel-copy h2,
      .person-side-panel-copy p,
      .person-actions-section h3,
      .person-info-section h3 {
        margin: 0;
      }

      .person-side-panel-kicker {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(58, 96, 142, 0.76);
      }

      .person-side-panel-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        border: 1px solid rgba(96, 114, 123, 0.16);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.82);
        color: var(--text);
        cursor: pointer;
      }

      .person-side-panel-close span {
        display: block;
        font-size: 22px;
        line-height: 1;
      }

      .person-side-panel-body {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .person-side-panel-top-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .person-top-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 46px;
        height: 46px;
        padding: 0;
        border: 1px solid rgba(127, 160, 200, 0.18);
        border-radius: 16px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.12), transparent 42%);
        color: #355579;
        cursor: pointer;
        transition:
          transform 140ms ease,
          border-color 140ms ease,
          box-shadow 140ms ease,
          color 140ms ease;
      }

      .person-top-action:hover {
        transform: translateY(-1px);
        border-color: rgba(53, 95, 152, 0.3);
        box-shadow: 0 12px 24px rgba(41, 69, 103, 0.12);
      }

      .person-top-action--primary {
        background: linear-gradient(135deg, #2f6da5, #4b87c0);
        border-color: rgba(47, 109, 165, 0.34);
        color: #ffffff;
      }

      .person-top-action-icon {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }

      .person-hero-card,
      .person-info-section,
      .person-actions-section {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px;
        border-radius: 22px;
        border: 1px solid rgba(127, 160, 200, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.16), transparent 42%);
      }

      .person-hero-card {
        align-items: center;
        text-align: center;
      }

      .person-photo-shell {
        width: 120px;
        height: 120px;
        overflow: hidden;
        border-radius: 32px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background: linear-gradient(180deg, rgba(233, 241, 251, 0.92), rgba(219, 233, 248, 0.92));
        box-shadow: 0 16px 34px rgba(41, 69, 103, 0.12);
      }

      .person-photo,
      .person-photo-fallback {
        width: 100%;
        height: 100%;
      }

      .person-photo {
        display: block;
        object-fit: cover;
      }

      .person-photo-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        font-weight: 800;
        color: #234261;
      }

      .person-hero-meta {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .person-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
      }

      .person-chip {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(223, 233, 246, 0.8);
        color: #24415f;
        font-size: 13px;
        font-weight: 700;
      }

      .person-hero-subtitle {
        margin: 0;
      }

      .person-info-grid,
      .person-action-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
        gap: 12px;
      }

      .person-info-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        border-radius: 18px;
        background: rgba(248, 251, 255, 0.88);
        border: 1px solid rgba(127, 160, 200, 0.14);
      }

      .person-info-card span {
        color: var(--muted-foreground);
        font-size: 12px;
      }

      .person-info-card strong {
        color: #17324d;
        font-size: 14px;
        line-height: 1.35;
        word-break: break-word;
      }

      .person-action-grid > .mat-mdc-button-base {
        justify-content: center;
      }

      @keyframes person-side-panel-enter {
        from {
          opacity: 0;
          transform: translateX(-24px);
        }

        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @media (max-width: 720px) {
        .person-side-panel {
          width: 100%;
          max-width: none;
        }

        .person-action-grid {
          grid-template-columns: 1fr;
        }

        .person-action-grid > .mat-mdc-button-base {
          width: 100%;
        }
      }
    `,
  ],
})
export class PersonSidePanelComponent {
  @Input() person: Person | null = null;
  @Input() contextLabel: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() openProfile = new EventEmitter<void>();
  @Output() openTree = new EventEmitter<void>();
  @Output() openGraph = new EventEmitter<void>();
  @Output() addParent = new EventEmitter<void>();
  @Output() addChild = new EventEmitter<void>();
  @Output() addSpouse = new EventEmitter<void>();

  displayName(person: Person): string {
    return formatPersonDisplayName(person);
  }

  renderablePhotoUrl(person: Person): string | null {
    return isSupportedPhotoUrl(person.photoUrl) ? person.photoUrl : null;
  }

  photoInitials(person: Person): string {
    return buildPhotoInitials(person.firstName, person.lastName);
  }

  genderLabel(gender: Person["gender"]): string {
    switch (gender) {
      case "male":
        return "чоловіча";
      case "female":
        return "жіноча";
      case "other":
        return "інша";
      case "unknown":
        return "не вказано";
    }
  }

  livingStatusLabel(person: Person): string {
    if (person.isLiving === true) {
      return "жива людина";
    }

    if (person.isLiving === false || person.deathDate) {
      return "померла людина";
    }

    return "статус не вказано";
  }
}
