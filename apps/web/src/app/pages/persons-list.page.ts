import type { Person } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";
import { SearchService } from "../services/search.service";

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page page-stack">
      <mat-card class="section-card hero-card">
        <div class="hero-copy">
          <mat-chip-set>
            <mat-chip>Люди</mat-chip>
          </mat-chip-set>
          <h1>Список людей</h1>
          <p class="muted">Створюйте профілі, знаходьте родичів і переходьте до дерева від вибраної людини.</p>
        </div>
        <a mat-flat-button color="primary" routerLink="/persons/new" class="action-link">Додати людину</a>
      </mat-card>

      <mat-card class="section-card">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Пошук по імені або прізвищу</mat-label>
          <input
            matInput
            id="search"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Наприклад, Петренко"
          >
        </mat-form-field>

        <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

        <div *ngIf="searchQuery.trim().length > 0">
          <h2>Результати пошуку</h2>

          <div class="person-grid" *ngIf="searchResults().length > 0; else noSearchResults">
            <mat-card class="person-card" *ngFor="let person of searchResults()">
              <div>
                <h3>{{ displayName(person) }}</h3>
                <p class="muted">{{ person.birthDate || "дата народження не вказана" }}</p>
              </div>
              <mat-card-actions class="card-actions">
                <a mat-stroked-button color="primary" [routerLink]="['/persons', person.id]" class="action-link">Профіль</a>
              </mat-card-actions>
            </mat-card>
          </div>

          <ng-template #noSearchResults>
            <div class="empty-state">Нічого не знайдено.</div>
          </ng-template>
        </div>
      </mat-card>

      <mat-card class="section-card">
        <div class="section-heading">
          <h2>Усі люди</h2>
          <mat-chip-set>
            <mat-chip>{{ persons().length }} записів</mat-chip>
          </mat-chip-set>
        </div>

        <div class="person-grid" *ngIf="persons().length > 0; else noPersons">
          <mat-card class="person-card" *ngFor="let person of persons()">
            <div class="person-copy">
              <h3>{{ displayName(person) }}</h3>
              <p class="muted">
                {{ person.birthPlace || "Місце народження не вказано" }}
              </p>
            </div>

            <mat-card-actions class="card-actions">
              <a mat-stroked-button color="primary" [routerLink]="['/persons', person.id]" class="action-link">Профіль</a>
              <a mat-button [routerLink]="['/tree', person.id]" class="action-link">Дерево</a>
            </mat-card-actions>
          </mat-card>
        </div>

        <ng-template #noPersons>
          <div class="empty-state">Список порожній. Створіть першу людину.</div>
        </ng-template>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .page-stack {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .section-card {
        padding: 24px;
      }

      .hero-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
      }

      .hero-copy mat-chip-set {
        margin-bottom: 6px;
      }

      .hero-card h1 {
        margin: 0 0 8px;
        font-size: clamp(34px, 4vw, 48px);
      }

      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .search-field {
        margin-bottom: 8px;
      }

      .person-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }

      .person-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 6px;
      }

      .person-card h3 {
        margin: 0 0 6px;
      }

      .person-copy p {
        margin: 0;
      }

      .card-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        padding: 0 10px 10px;
      }

      .action-link {
        text-decoration: none;
      }

      @media (max-width: 720px) {
        .hero-card {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class PersonsListPageComponent {
  private readonly personsService = inject(PersonsService);
  private readonly searchService = inject(SearchService);

  readonly persons = signal<Person[]>([]);
  readonly searchResults = signal<Person[]>([]);
  readonly errorMessage = signal("");

  searchQuery = "";

  constructor() {
    void this.loadPersons();
  }

  async onSearchChange(query: string): Promise<void> {
    this.searchQuery = query;
    this.errorMessage.set("");

    if (query.trim().length === 0) {
      this.searchResults.set([]);
      return;
    }

    try {
      const results = await awaitOne<Person[]>(this.searchService.search(query.trim()));
      this.searchResults.set(results);
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }

  displayName(person: Person): string {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
  }

  private async loadPersons(): Promise<void> {
    try {
      this.persons.set(await awaitOne<Person[]>(this.personsService.list()));
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}
