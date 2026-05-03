import type { PaginatedResult, Person } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { formatPersonDisplayName } from "../lib/person-name";
import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { LoadingOverlayService } from "../services/loading-overlay.service";
import { PersonsService } from "../services/persons.service";

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page page-stack">
      <mat-card class="section-card shell-card">
        <div class="page-header">
          <div class="page-copy">
            <p class="eyebrow">Люди</p>
            <h1>Усі профілі в одній видачі</h1>
            <p class="muted">Шукайте по всій базі та переходьте в профіль або дерево без перемикання режимів.</p>
          </div>

          <a mat-flat-button color="primary" routerLink="/persons/new" class="action-link add-person-button">Додати людину</a>
        </div>
      </mat-card>

      <mat-card class="section-card panel-card">
        <div class="section-heading">
          <div class="heading-copy">
            <h2>Пошук по всіх людях</h2>
            <p class="muted">Пошук і пагінація виконуються на бекенді.</p>
          </div>

          <div class="counter-pill">
            {{ totalItems() }}
            <span>знайдено</span>
          </div>
        </div>

        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Ім’я, прізвище або місце народження</mat-label>
          <input
            matInput
            id="persons-search"
            [ngModel]="query()"
            (ngModelChange)="onQueryChange($event)"
            placeholder="Наприклад, Петренко"
          >
        </mat-form-field>

        <p class="error-text" *ngIf="listErrorMessage()">{{ listErrorMessage() }}</p>
        <mat-progress-bar *ngIf="isLoading()" mode="indeterminate"></mat-progress-bar>

        <div class="person-grid" *ngIf="persons().length > 0; else emptyState">
          <mat-card
            class="person-card interactive-card"
            *ngFor="let person of persons()"
            tabindex="0"
            role="link"
            (click)="goToPerson(person.id)"
            (keydown.enter)="goToPerson(person.id)"
            (keydown.space)="onPersonCardKeydown($event, person.id)"
          >
            <div class="person-copy">
              <h3>{{ displayListName(person) }}</h3>
              <p class="person-meta">{{ displayLifeSummary(person.birthDate, person.deathDate, person.isLiving) }}</p>
              <p class="muted">{{ displayBirthPlace(person.birthPlace) }}</p>
            </div>

            <mat-card-actions class="card-actions">
              <div class="card-entry">
                <span class="card-primary-hint">Відкрити профіль</span>
                <span class="card-arrow" aria-hidden="true">↗</span>
              </div>
              <a
                mat-button
                [routerLink]="['/tree', person.id]"
                class="action-link card-secondary-action"
                (click)="$event.stopPropagation()"
              >
                Дерево
              </a>
            </mat-card-actions>
          </mat-card>
        </div>

        <div class="pagination-bar" *ngIf="totalPages() > 1">
          <p class="muted pagination-meta">{{ pageStart() }}-{{ pageEnd() }} з {{ totalItems() }}</p>

          <div class="pagination-actions">
            <button mat-stroked-button type="button" (click)="goToPreviousPage()" [disabled]="page() === 1 || isLoading()">
              Назад
            </button>
            <span class="pagination-current">{{ page() }} / {{ totalPages() }}</span>
            <button
              mat-stroked-button
              type="button"
              (click)="goToNextPage()"
              [disabled]="page() >= totalPages() || isLoading()"
            >
              Далі
            </button>
          </div>
        </div>

        <ng-template #emptyState>
          <div class="empty-state" *ngIf="!isLoading() && listErrorMessage(); else noResultsState">
            <h3>Не вдалося завантажити список</h3>
            <p class="muted">Сервер не повернув список людей. Спробуйте перезавантажити сторінку трохи пізніше.</p>
          </div>
        </ng-template>

        <ng-template #noResultsState>
          <div class="empty-state" *ngIf="!isLoading()">
            <h3>{{ totalItems() === 0 ? "Список порожній" : "Нічого не знайдено" }}</h3>
            <p class="muted">
              {{
                totalItems() === 0
                  ? "Створіть першу людину і далі вже будуйте зв’язки та дерево."
                  : "Спробуйте інше ім’я, прізвище або очистьте пошук."
              }}
            </p>
            <div class="empty-actions">
              <a
                *ngIf="totalItems() === 0"
                mat-flat-button
                color="primary"
                routerLink="/persons/new"
                class="action-link"
              >
                Створити першу людину
              </a>
              <button *ngIf="totalItems() > 0" mat-stroked-button type="button" (click)="clearQuery()">
                Очистити пошук
              </button>
            </div>
          </div>
        </ng-template>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .page-stack {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .section-card {
        padding: clamp(18px, 2.2vw, 24px);
      }

      .shell-card,
      .panel-card {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .shell-card {
        background:
          radial-gradient(circle at top left, rgba(96, 149, 217, 0.14), transparent 32%),
          linear-gradient(180deg, rgba(252, 253, 255, 0.98), rgba(246, 250, 255, 0.98));
        border: 1px solid rgba(120, 152, 195, 0.14);
      }

      .page-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        min-width: 0;
      }

      .page-copy {
        max-width: 760px;
        min-width: 0;
      }

      .eyebrow {
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(55, 91, 135, 0.74);
      }

      .page-copy h1 {
        margin: 0 0 10px;
        font-size: clamp(28px, 3.6vw, 40px);
        line-height: 1.02;
      }

      .page-copy p {
        margin: 0;
        max-width: 62ch;
      }

      .add-person-button {
        min-height: 46px;
        flex: 0 0 auto;
      }

      .panel-card {
        border: 1px solid rgba(127, 160, 200, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 251, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.28), transparent 42%);
      }

      .section-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
      }

      .heading-copy {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .heading-copy h2,
      .heading-copy p {
        margin: 0;
      }

      .counter-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: rgba(223, 233, 246, 0.8);
        color: #24415f;
        font-weight: 700;
      }

      .search-field {
        width: 100%;
      }

      .pagination-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
      }

      .pagination-meta {
        margin: 0;
      }

      .pagination-actions {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .pagination-current {
        min-width: 72px;
        text-align: center;
        font-weight: 700;
        color: #24415f;
      }

      .person-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
        gap: 16px;
      }

      .person-card {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: 100%;
        padding: 14px;
        border: 1px solid rgba(112, 144, 184, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          radial-gradient(circle at top right, rgba(212, 228, 248, 0.34), transparent 34%);
      }

      .interactive-card {
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
      }

      .interactive-card:hover,
      .interactive-card:focus-visible {
        transform: translateY(-2px);
        box-shadow: 0 18px 36px rgba(19, 33, 45, 0.12);
        border-color: rgba(83, 129, 184, 0.28);
      }

      .person-copy {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .person-card h3 {
        margin: 0;
        font-size: 20px;
        line-height: 1.12;
      }

      .person-meta {
        margin: 0;
        color: #26496f;
        font-weight: 600;
      }

      .person-copy p {
        margin: 0;
      }

      .card-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: auto;
        padding: 0;
      }

      .card-entry {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .card-primary-hint {
        color: rgba(35, 65, 101, 0.82);
        font-size: 14px;
        font-weight: 700;
      }

      .card-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: rgba(222, 232, 246, 0.92);
        color: #234261;
        font-size: 14px;
        font-weight: 700;
      }

      .card-secondary-action {
        margin-right: -8px;
        color: #234261;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: flex-start;
        padding: clamp(18px, 3vw, 28px);
        border-radius: 22px;
        background:
          radial-gradient(circle at top left, rgba(223, 233, 248, 0.6), transparent 34%),
          rgba(245, 249, 255, 0.96);
        border: 1px dashed rgba(131, 160, 196, 0.32);
      }

      .empty-state h3,
      .empty-state p {
        margin: 0;
      }

      .empty-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .action-link {
        text-decoration: none;
      }

      @media (max-width: 900px) {
        .page-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .page-copy {
          max-width: none;
        }

        .add-person-button {
          align-self: stretch;
        }
      }

      @media (max-width: 720px) {
        .section-card {
          padding: 18px 16px;
        }

        .page-copy h1 {
          font-size: 28px;
          line-height: 1.08;
        }

        .add-person-button {
          width: 100%;
          justify-content: center;
        }

        .card-actions {
          flex-direction: column;
          align-items: stretch;
        }

        .card-secondary-action {
          width: 100%;
          margin-right: 0;
        }

        .pagination-bar,
        .pagination-actions {
          width: 100%;
        }

        .pagination-actions > .mat-mdc-button-base {
          flex: 1 1 0;
        }

        .empty-actions > .mat-mdc-button-base,
        .empty-actions > .action-link {
          width: 100%;
        }
      }
    `,
  ],
})
export class PersonsListPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly personsService = inject(PersonsService);
  private readonly router = inject(Router);
  private readonly loadingOverlay = inject(LoadingOverlayService);
  private readonly pageSize = 12;

  readonly isLoading = signal(true);
  readonly persons = signal<Person[]>([]);
  readonly query = signal("");
  readonly page = signal(1);
  readonly totalItems = signal(0);
  readonly totalPages = signal(1);
  readonly listErrorMessage = signal("");

  constructor() {
    effect(
      () => {
        if (this.isLoading()) {
          this.loadingOverlay.show("persons-list-page");
        } else {
          this.loadingOverlay.hide("persons-list-page");
        }
      },
      { allowSignalWrites: true },
    );

    this.destroyRef.onDestroy(() => {
      this.loadingOverlay.hide("persons-list-page");
    });

    void this.loadPersons();
  }

  onQueryChange(query: string): void {
    this.query.set(query);
    this.page.set(1);
    void this.loadPersons();
  }

  clearQuery(): void {
    this.query.set("");
    this.page.set(1);
    void this.loadPersons();
  }

  displayListName(person: Person): string {
    return buildPersonName(person.lastName, person.firstName, person.middleName, person.maidenName);
  }

  displayLifeSummary(birthDate: string | null, deathDate: string | null, isLiving: boolean | null): string {
    return buildLifeSummary(birthDate, deathDate, isLiving);
  }

  displayBirthPlace(birthPlace: string | null): string {
    return birthPlace || "Місце народження не вказано";
  }

  pageStart(): number {
    if (this.totalItems() === 0) {
      return 0;
    }

    return (this.page() - 1) * this.pageSize + 1;
  }

  pageEnd(): number {
    return Math.min(this.page() * this.pageSize, this.totalItems());
  }

  goToPerson(personId: string): void {
    void this.router.navigate(["/persons", personId]);
  }

  onPersonCardKeydown(event: Event, personId: string): void {
    event.preventDefault();
    this.goToPerson(personId);
  }

  goToPreviousPage(): void {
    if (this.page() > 1) {
      this.page.update((page) => Math.max(1, page - 1));
      void this.loadPersons();
    }
  }

  goToNextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.update((page) => Math.min(this.totalPages(), page + 1));
      void this.loadPersons();
    }
  }

  private async loadPersons(): Promise<void> {
    this.isLoading.set(true);
    this.listErrorMessage.set("");

    try {
      const response = await awaitOne<PaginatedResult<Person>>(
        this.personsService.listAll({
          q: this.query().trim() || undefined,
          page: this.page(),
          pageSize: this.pageSize,
        }),
      );

      this.persons.set(response.items);
      this.totalItems.set(response.totalItems);
      this.totalPages.set(response.totalPages);
      this.page.set(response.page);
    } catch (error) {
      this.listErrorMessage.set(readApiError(error));
      this.persons.set([]);
      this.totalItems.set(0);
      this.totalPages.set(1);
    } finally {
      this.isLoading.set(false);
    }
  }
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}

function buildPersonName(
  lastName: string | null,
  firstName: string,
  middleName: string | null,
  maidenName: string | null,
): string {
  return formatPersonDisplayName({ firstName, middleName, lastName, maidenName }, { order: "surname-first" });
}

function buildLifeSummary(birthDate: string | null, deathDate: string | null, isLiving: boolean | null): string {
  if (birthDate && deathDate) {
    return `${birthDate} - ${deathDate}`;
  }

  if (birthDate) {
    return `Народження: ${birthDate}`;
  }

  if (deathDate) {
    return `Смерть: ${deathDate}`;
  }

  if (isLiving === true) {
    return "Жива людина";
  }

  if (isLiving === false) {
    return "Померла людина";
  }

  return "Дати життя не вказані";
}
