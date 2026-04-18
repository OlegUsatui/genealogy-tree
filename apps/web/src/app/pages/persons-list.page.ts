import type { Person, PersonSearchCandidate } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { LoadingOverlayService } from "../services/loading-overlay.service";
import { PersonsService } from "../services/persons.service";
import { SearchService } from "../services/search.service";

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page page-stack">
      <mat-card class="section-card shell-card">
        <div class="page-header">
          <div class="page-copy">
            <p class="eyebrow">Люди</p>
            <h1>Профілі та зв’язки без зайвого шуму</h1>
            <p class="muted">
              Тримайте свої записи під рукою, а глобальний пошук вмикайте лише тоді, коли треба знайти людину в
              іншому акаунті.
            </p>
          </div>

          <a mat-flat-button color="primary" routerLink="/persons/new" class="action-link add-person-button">Додати людину</a>
        </div>

        <div class="mode-switch" role="tablist" aria-label="Режими сторінки людей">
          <button
            type="button"
            class="mode-pill"
            [class.is-active]="mode() === 'mine'"
            (click)="setMode('mine')"
          >
            Мої люди
          </button>
          <button
            type="button"
            class="mode-pill"
            [class.is-active]="mode() === 'directory'"
            (click)="setMode('directory')"
          >
            Пошук у базі
          </button>
        </div>
      </mat-card>

      <mat-card class="section-card panel-card" *ngIf="mode() === 'mine'; else directoryPanel">
        <div class="section-heading">
          <div class="heading-copy">
            <h2>Мої люди</h2>
          </div>

          <div class="counter-pill">
            {{ filteredPersons().length }}
            <span *ngIf="localQuery().trim().length > 0">з {{ persons().length }}</span>
          </div>
        </div>

        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Фільтр по моєму дереву</mat-label>
          <input
            matInput
            id="local-search"
            [ngModel]="localQuery()"
            (ngModelChange)="onLocalQueryChange($event)"
            placeholder="Ім’я, прізвище або місто народження"
          >
        </mat-form-field>

        <p class="muted search-helper" *ngIf="localQuery().trim().length > 0">
          Знайдено {{ filteredPersons().length }} профілів у вашому дереві.
        </p>
        <p class="error-text" *ngIf="listErrorMessage()">{{ listErrorMessage() }}</p>

        <div class="person-grid" *ngIf="filteredPersons().length > 0; else mineEmptyState">
          <mat-card
            class="person-card interactive-card"
            *ngFor="let person of pagedPersons()"
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

        <div class="pagination-bar" *ngIf="hasLocalPagination()">
          <p class="muted pagination-meta">{{ localPageStart() }}-{{ localPageEnd() }} з {{ filteredPersons().length }}</p>

          <div class="pagination-actions">
            <button
              mat-stroked-button
              type="button"
              (click)="goToPreviousLocalPage()"
              [disabled]="activeLocalPage() === 1"
            >
              Назад
            </button>
            <span class="pagination-current">{{ activeLocalPage() }} / {{ localTotalPages() }}</span>
            <button
              mat-stroked-button
              type="button"
              (click)="goToNextLocalPage()"
              [disabled]="activeLocalPage() >= localTotalPages()"
            >
              Далі
            </button>
          </div>
        </div>

        <ng-template #mineEmptyState>
          <div class="empty-state" *ngIf="!isLoading() && listErrorMessage(); else mineNoResultsState">
            <h3>Не вдалося завантажити список</h3>
            <p class="muted">Сервер не повернув список людей. Спробуйте перезавантажити сторінку трохи пізніше.</p>
          </div>
        </ng-template>

        <ng-template #mineNoResultsState>
          <div class="empty-state" *ngIf="!isLoading()">
            <h3>{{ persons().length === 0 ? "Список порожній" : "Нічого не знайдено" }}</h3>
            <p class="muted">
              {{
                persons().length === 0
                  ? "Створіть першу людину і далі вже будуйте зв’язки та дерево."
                  : "Спробуйте інше ім’я, прізвище або очистьте локальний фільтр."
              }}
            </p>
            <div class="empty-actions">
              <a
                *ngIf="persons().length === 0"
                mat-flat-button
                color="primary"
                routerLink="/persons/new"
                class="action-link"
              >
                Створити першу людину
              </a>
              <button *ngIf="persons().length > 0" mat-stroked-button type="button" (click)="clearLocalQuery()">
                Очистити фільтр
              </button>
            </div>
          </div>
        </ng-template>
      </mat-card>

      <ng-template #directoryPanel>
        <mat-card class="section-card panel-card">
          <div class="section-heading">
            <div class="heading-copy">
              <h2>Пошук у базі</h2>
              <p class="muted">Шукайте людей по всіх акаунтах. Після трьох літер підемо на бекенд.</p>
            </div>

            <div class="counter-pill" *ngIf="showDirectoryResults()">{{ searchResults().length }} знайдено</div>
          </div>

          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Ім’я, прізвище або по батькові</mat-label>
            <input
              matInput
              id="directory-search"
              [ngModel]="directoryQuery()"
              (ngModelChange)="onDirectoryQueryChange($event)"
              placeholder="Наприклад, Петренко"
            >
          </mat-form-field>

          <p class="muted search-helper">
            Глобальний пошук проходить по всій базі акаунтів і відкриває канонічний профіль людини.
          </p>
          <mat-progress-bar *ngIf="isSearching()" mode="indeterminate"></mat-progress-bar>
          <p class="error-text" *ngIf="searchErrorMessage()">{{ searchErrorMessage() }}</p>

          <div class="empty-state status-state" *ngIf="showDirectoryIntro()">
            <h3>Почніть пошук</h3>
            <p class="muted">Введіть ім’я або прізвище, щоб побачити профілі з усієї бази.</p>
          </div>

          <div class="empty-state status-state" *ngIf="showDirectoryMinLengthHint()">
            <h3>Ще трохи тексту</h3>
            <p class="muted">
              Введіть ще {{ remainingDirectoryCharacters() }} {{ remainingDirectoryCharactersLabel() }}, і тоді пошук
              відправиться на сервер.
            </p>
          </div>

          <div class="person-grid" *ngIf="showDirectoryResults()">
            <mat-card
              class="person-card interactive-card search-result-card"
              *ngFor="let person of searchResults()"
              tabindex="0"
              role="link"
              (click)="goToPerson(person.sourcePersonId)"
              (keydown.enter)="goToPerson(person.sourcePersonId)"
              (keydown.space)="onPersonCardKeydown($event, person.sourcePersonId)"
            >
              <div class="person-copy">
                <h3>{{ displaySearchName(person) }}</h3>
                <p class="person-meta">{{ displayLifeSummary(person.birthDate, null, person.isLiving) }}</p>
                <p class="muted">{{ displayBirthPlace(person.birthPlace) }}</p>
              </div>

              <div class="card-entry search-card-hint">
                <span class="card-primary-hint">Відкрити профіль</span>
                <span class="card-arrow" aria-hidden="true">↗</span>
              </div>
            </mat-card>
          </div>

          <div class="empty-state" *ngIf="showDirectoryEmpty()">
            <h3>Нічого не знайдено</h3>
            <p class="muted">
              Якщо цієї людини ще немає в базі, створіть окремий профіль і далі вже зв’язуйте його з іншими.
            </p>
            <div class="empty-actions">
              <a mat-flat-button color="primary" routerLink="/persons/new" class="action-link">Додати людину</a>
              <button mat-stroked-button type="button" (click)="clearDirectoryQuery()">Очистити пошук</button>
            </div>
          </div>
        </mat-card>
      </ng-template>
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

      .mode-switch {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 8px;
        width: fit-content;
        max-width: 100%;
        padding: 6px;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(221, 232, 246, 0.82), rgba(210, 223, 241, 0.72));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
      }

      .mode-pill {
        border: 0;
        background: transparent;
        color: #385270;
        font: inherit;
        font-weight: 700;
        padding: 10px 16px;
        border-radius: 999px;
        cursor: pointer;
        transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
      }

      .mode-pill.is-active {
        background: #ffffff;
        color: #17324d;
        box-shadow: 0 8px 22px rgba(48, 76, 112, 0.14);
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

      .search-helper {
        margin: -4px 0 0;
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

      .search-result-card {
        justify-content: space-between;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(245, 250, 255, 0.98)),
          radial-gradient(circle at top right, rgba(194, 222, 255, 0.3), transparent 36%);
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

      .search-card-hint {
        margin-top: auto;
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

      .status-state {
        min-height: 180px;
        justify-content: center;
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

        .mode-switch {
          width: 100%;
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

        .mode-pill {
          flex: 1 1 calc(50% - 4px);
          text-align: center;
        }

        .counter-pill {
          min-height: 36px;
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
  private readonly searchService = inject(SearchService);
  private readonly router = inject(Router);
  private readonly loadingOverlay = inject(LoadingOverlayService);
  private readonly pageSize = 10;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private latestSearchToken = 0;

  readonly isLoading = signal(true);
  readonly mode = signal<"mine" | "directory">("mine");
  readonly persons = signal<Person[]>([]);
  readonly localQuery = signal("");
  readonly currentLocalPage = signal(1);
  readonly directoryQuery = signal("");
  readonly searchResults = signal<PersonSearchCandidate[]>([]);
  readonly listErrorMessage = signal("");
  readonly searchErrorMessage = signal("");
  readonly isSearching = signal(false);
  readonly hasCompletedDirectorySearch = signal(false);
  readonly filteredPersons = computed(() => {
    const query = normalizeSearchValue(this.localQuery());

    if (!query) {
      return this.persons();
    }

    return this.persons().filter((person) => buildLocalPersonIndex(person).includes(query));
  });
  readonly localTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredPersons().length / this.pageSize)));
  readonly activeLocalPage = computed(() => Math.min(this.currentLocalPage(), this.localTotalPages()));
  readonly pagedPersons = computed(() => {
    const startIndex = (this.activeLocalPage() - 1) * this.pageSize;
    return this.filteredPersons().slice(startIndex, startIndex + this.pageSize);
  });
  readonly hasLocalPagination = computed(() => this.filteredPersons().length > this.pageSize);

  readonly showDirectoryIntro = computed(() => this.directoryQuery().trim().length === 0);
  readonly showDirectoryMinLengthHint = computed(() => {
    const length = this.directoryQuery().trim().length;
    return length > 0 && length < 3;
  });
  readonly showDirectoryResults = computed(
    () => this.directoryQuery().trim().length >= 3 && this.searchResults().length > 0,
  );
  readonly showDirectoryEmpty = computed(
    () =>
      this.directoryQuery().trim().length >= 3 &&
      this.hasCompletedDirectorySearch() &&
      !this.isSearching() &&
      this.searchResults().length === 0 &&
      this.searchErrorMessage().length === 0,
  );

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
      this.clearSearchDebounce();
    });

    void this.loadPersons();
  }

  setMode(mode: "mine" | "directory"): void {
    this.mode.set(mode);
  }

  onLocalQueryChange(query: string): void {
    this.localQuery.set(query);
    this.currentLocalPage.set(1);
  }

  clearLocalQuery(): void {
    this.localQuery.set("");
    this.currentLocalPage.set(1);
  }

  clearDirectoryQuery(): void {
    this.directoryQuery.set("");
    this.searchResults.set([]);
    this.searchErrorMessage.set("");
    this.hasCompletedDirectorySearch.set(false);
    this.isSearching.set(false);
    this.clearSearchDebounce();
    this.latestSearchToken += 1;
  }

  async onDirectoryQueryChange(query: string): Promise<void> {
    this.directoryQuery.set(query);
    this.searchErrorMessage.set("");
    this.hasCompletedDirectorySearch.set(false);
    this.clearSearchDebounce();
    this.latestSearchToken += 1;

    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    if (normalizedQuery.length < 3) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    const searchToken = this.latestSearchToken;
    this.searchResults.set([]);
    this.isSearching.set(true);
    this.searchDebounceTimer = setTimeout(() => {
      void this.fetchSearchResults(normalizedQuery, searchToken);
    }, 250);
  }

  displayListName(person: Person): string {
    return buildPersonName(person.lastName, person.firstName, person.middleName);
  }

  displaySearchName(person: PersonSearchCandidate): string {
    return buildPersonName(person.lastName, person.firstName, person.middleName);
  }

  displayLifeSummary(birthDate: string | null, deathDate: string | null, isLiving: boolean | null): string {
    return buildLifeSummary(birthDate, deathDate, isLiving);
  }

  displayBirthPlace(birthPlace: string | null): string {
    return birthPlace || "Місце народження не вказано";
  }

  localPageStart(): number {
    if (this.filteredPersons().length === 0) {
      return 0;
    }

    return (this.activeLocalPage() - 1) * this.pageSize + 1;
  }

  localPageEnd(): number {
    return Math.min(this.activeLocalPage() * this.pageSize, this.filteredPersons().length);
  }

  remainingDirectoryCharacters(): number {
    return Math.max(0, 3 - this.directoryQuery().trim().length);
  }

  remainingDirectoryCharactersLabel(): string {
    return pluralizeLetters(this.remainingDirectoryCharacters());
  }

  goToPerson(personId: string): void {
    void this.router.navigate(["/persons", personId]);
  }

  onPersonCardKeydown(event: Event, personId: string): void {
    event.preventDefault();
    this.goToPerson(personId);
  }

  goToPreviousLocalPage(): void {
    this.currentLocalPage.update((page) => Math.max(1, page - 1));
  }

  goToNextLocalPage(): void {
    this.currentLocalPage.update((page) => Math.min(this.localTotalPages(), page + 1));
  }

  private async loadPersons(): Promise<void> {
    this.isLoading.set(true);

    try {
      const persons = await awaitOne<Person[]>(this.personsService.list());
      this.persons.set(sortPersons(persons));
    } catch (error) {
      this.listErrorMessage.set(readApiError(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private async fetchSearchResults(query: string, searchToken: number): Promise<void> {
    try {
      const results = await awaitOne<PersonSearchCandidate[]>(this.searchService.search(query));

      if (searchToken !== this.latestSearchToken) {
        return;
      }

      this.searchResults.set(results);
    } catch (error) {
      if (searchToken !== this.latestSearchToken) {
        return;
      }

      this.searchErrorMessage.set(readApiError(error));
      this.searchResults.set([]);
    } finally {
      if (searchToken === this.latestSearchToken) {
        this.isSearching.set(false);
        this.hasCompletedDirectorySearch.set(true);
      }
    }
  }

  private clearSearchDebounce(): void {
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}

function buildPersonName(lastName: string | null, firstName: string, middleName: string | null): string {
  return [lastName, firstName, middleName].filter(Boolean).join(" ");
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

function buildLocalPersonIndex(person: Person): string {
  return normalizeSearchValue(
    [
      person.firstName,
      person.lastName,
      person.middleName,
      person.maidenName,
      person.birthPlace,
      person.birthDate,
      person.deathDate,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase("uk-UA");
}

function pluralizeLetters(count: number): string {
  const remainder10 = count % 10;
  const remainder100 = count % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return "літеру";
  }

  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
    return "літери";
  }

  return "літер";
}

function sortPersons(persons: Person[]): Person[] {
  return [...persons].sort((left, right) =>
    buildPersonName(left.lastName, left.firstName, left.middleName).localeCompare(
      buildPersonName(right.lastName, right.firstName, right.middleName),
      "uk",
    ),
  );
}
