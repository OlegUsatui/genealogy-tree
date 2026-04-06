import type { CreateRelationshipDto, Person, Relationship } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";
import { RelationshipsService } from "../services/relationships.service";

type RelationshipDirection = "current_is_parent" | "current_is_child";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="app-page page-layout" *ngIf="person() as person">
      <section class="card profile-card">
        <div class="profile-header">
          <div>
            <span class="chip">Профіль</span>
            <h1>{{ displayName(person) }}</h1>
            <p class="muted">{{ person.biography || "Біографія ще не додана." }}</p>
          </div>

          <div class="profile-actions">
            <a [routerLink]="['/persons', person.id, 'edit']" class="btn btn-secondary action-link">Редагувати</a>
            <a [routerLink]="['/tree', person.id]" class="btn btn-secondary action-link">Відкрити дерево</a>
            <button type="button" class="btn btn-danger" (click)="deletePerson()">Видалити</button>
          </div>
        </div>

        <div class="details-grid">
          <div class="detail-item"><span>Стать</span><strong>{{ person.gender }}</strong></div>
          <div class="detail-item"><span>Дата народження</span><strong>{{ person.birthDate || "—" }}</strong></div>
          <div class="detail-item"><span>Дата смерті</span><strong>{{ person.deathDate || "—" }}</strong></div>
          <div class="detail-item"><span>Місце народження</span><strong>{{ person.birthPlace || "—" }}</strong></div>
          <div class="detail-item"><span>Місце смерті</span><strong>{{ person.deathPlace || "—" }}</strong></div>
          <div class="detail-item"><span>Photo URL</span><strong>{{ person.photoUrl || "—" }}</strong></div>
        </div>
      </section>

      <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

      <section class="card relationships-card">
        <div class="section-heading">
          <div>
            <h2>Родинні зв’язки</h2>
            <p class="muted">Parent-child та spouse. Похідні зв’язки не зберігаються окремо.</p>
          </div>
        </div>

        <div class="relationship-groups">
          <div class="relationship-column">
            <h3>Батьки</h3>
            <div *ngIf="parents().length > 0; else emptyParents">
              <article class="relationship-row" *ngFor="let item of parents()">
                <div>
                  <a [routerLink]="['/persons', item.relatedPerson.id]">{{ displayName(item.relatedPerson) }}</a>
                  <p class="muted">{{ item.relationship.notes || "parent-child" }}</p>
                </div>
                <button type="button" class="btn btn-secondary" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
              </article>
            </div>
            <ng-template #emptyParents><div class="empty-state">Батьки не вказані.</div></ng-template>
          </div>

          <div class="relationship-column">
            <h3>Партнери</h3>
            <div *ngIf="spouses().length > 0; else emptySpouses">
              <article class="relationship-row" *ngFor="let item of spouses()">
                <div>
                  <a [routerLink]="['/persons', item.relatedPerson.id]">{{ displayName(item.relatedPerson) }}</a>
                  <p class="muted">{{ item.relationship.startDate || "дата не вказана" }}</p>
                </div>
                <button type="button" class="btn btn-secondary" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
              </article>
            </div>
            <ng-template #emptySpouses><div class="empty-state">Партнери не вказані.</div></ng-template>
          </div>

          <div class="relationship-column">
            <h3>Діти</h3>
            <div *ngIf="children().length > 0; else emptyChildren">
              <article class="relationship-row" *ngFor="let item of children()">
                <div>
                  <a [routerLink]="['/persons', item.relatedPerson.id]">{{ displayName(item.relatedPerson) }}</a>
                  <p class="muted">{{ item.relationship.notes || "parent-child" }}</p>
                </div>
                <button type="button" class="btn btn-secondary" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
              </article>
            </div>
            <ng-template #emptyChildren><div class="empty-state">Діти не вказані.</div></ng-template>
          </div>
        </div>
      </section>

      <section class="card relationship-form-card">
        <div class="section-heading">
          <div>
            <h2>Додати зв’язок</h2>
            <p class="muted">Вкажіть тип і другу людину. Для parent-child виберіть напрямок.</p>
          </div>
        </div>

        <form [formGroup]="relationshipForm" (ngSubmit)="createRelationship()" class="form-grid">
          <div class="field-grid">
            <div class="field">
              <label for="type">Тип зв’язку</label>
              <select id="type" formControlName="type">
                <option value="parent_child">parent_child</option>
                <option value="spouse">spouse</option>
              </select>
            </div>

            <div class="field" *ngIf="relationshipForm.controls.type.value === 'parent_child'">
              <label for="direction">Напрямок</label>
              <select id="direction" formControlName="direction">
                <option value="current_is_parent">Поточна людина є батьком / матір’ю</option>
                <option value="current_is_child">Поточна людина є дитиною</option>
              </select>
            </div>

            <div class="field">
              <label for="relatedPersonId">Інша людина</label>
              <select id="relatedPersonId" formControlName="relatedPersonId">
                <option value="">Оберіть людину</option>
                <option *ngFor="let candidate of relationshipCandidates()" [value]="candidate.id">
                  {{ displayName(candidate) }}
                </option>
              </select>
            </div>

            <div class="field">
              <label for="startDate">Початок</label>
              <input id="startDate" type="date" formControlName="startDate">
            </div>

            <div class="field">
              <label for="endDate">Кінець</label>
              <input id="endDate" type="date" formControlName="endDate">
            </div>
          </div>

          <div class="field">
            <label for="notes">Нотатки</label>
            <textarea id="notes" formControlName="notes"></textarea>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="relationshipForm.invalid || isSubmittingRelationship()">
              {{ isSubmittingRelationship() ? "Додавання..." : "Додати зв’язок" }}
            </button>
          </div>
        </form>
      </section>
    </section>
  `,
  styles: [
    `
      .page-layout {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .profile-card,
      .relationships-card,
      .relationship-form-card {
        padding: 24px;
      }

      .profile-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      .profile-header h1 {
        margin: 12px 0 8px;
      }

      .profile-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .action-link {
        text-decoration: none;
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }

      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid var(--border);
      }

      .detail-item span {
        color: var(--muted);
        font-size: 13px;
      }

      .section-heading {
        margin-bottom: 16px;
      }

      .relationship-groups {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }

      .relationship-column {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .relationship-column h3 {
        margin: 0;
      }

      .relationship-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--border);
      }

      .relationship-row p {
        margin: 4px 0 0;
      }

      .form-grid {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .form-actions {
        display: flex;
        justify-content: flex-start;
      }

      @media (max-width: 860px) {
        .profile-header {
          flex-direction: column;
        }

        .relationship-row {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class PersonDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly personsService = inject(PersonsService);
  private readonly relationshipsService = inject(RelationshipsService);

  readonly person = signal<Person | null>(null);
  readonly allPersons = signal<Person[]>([]);
  readonly relationships = signal<Relationship[]>([]);
  readonly errorMessage = signal("");
  readonly isSubmittingRelationship = signal(false);

  readonly relationshipForm = new FormGroup({
    type: new FormControl<Relationship["type"]>("parent_child", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    direction: new FormControl<RelationshipDirection>("current_is_parent", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    relatedPersonId: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    startDate: new FormControl("", { nonNullable: true }),
    endDate: new FormControl("", { nonNullable: true }),
    notes: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const personId = params.get("id");

      if (personId) {
        void this.loadPage(personId);
      }
    });
  }

  relationshipCandidates(): Person[] {
    const currentId = this.person()?.id;
    return this.allPersons().filter((candidate) => candidate.id !== currentId);
  }

  parents(): RelationshipView[] {
    const current = this.person();

    if (!current) {
      return [];
    }

    return this.relationships()
      .filter((relationship) => relationship.type === "parent_child" && relationship.person2Id === current.id)
      .map((relationship) => this.createRelationshipView(relationship, relationship.person1Id))
      .filter(Boolean) as RelationshipView[];
  }

  children(): RelationshipView[] {
    const current = this.person();

    if (!current) {
      return [];
    }

    return this.relationships()
      .filter((relationship) => relationship.type === "parent_child" && relationship.person1Id === current.id)
      .map((relationship) => this.createRelationshipView(relationship, relationship.person2Id))
      .filter(Boolean) as RelationshipView[];
  }

  spouses(): RelationshipView[] {
    const current = this.person();

    if (!current) {
      return [];
    }

    return this.relationships()
      .filter((relationship) => relationship.type === "spouse")
      .map((relationship) => {
        const relatedPersonId = relationship.person1Id === current.id ? relationship.person2Id : relationship.person1Id;
        return this.createRelationshipView(relationship, relatedPersonId);
      })
      .filter(Boolean) as RelationshipView[];
  }

  displayName(person: Person): string {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
  }

  async createRelationship(): Promise<void> {
    const currentPerson = this.person();

    if (!currentPerson || this.relationshipForm.invalid) {
      this.relationshipForm.markAllAsTouched();
      return;
    }

    this.isSubmittingRelationship.set(true);
    this.errorMessage.set("");

    try {
      const value = this.relationshipForm.getRawValue();
      const payload = buildRelationshipPayload(currentPerson.id, value);
      await awaitOne<Relationship>(this.relationshipsService.create(payload));
      this.relationshipForm.reset({
        type: "parent_child",
        direction: "current_is_parent",
        relatedPersonId: "",
        startDate: "",
        endDate: "",
        notes: "",
      });
      await this.loadPage(currentPerson.id);
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isSubmittingRelationship.set(false);
    }
  }

  async deleteRelationship(relationshipId: string): Promise<void> {
    const currentPerson = this.person();

    if (!currentPerson) {
      return;
    }

    try {
      await awaitOne<void>(this.relationshipsService.delete(relationshipId));
      await this.loadPage(currentPerson.id);
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }

  async deletePerson(): Promise<void> {
    const currentPerson = this.person();

    if (!currentPerson) {
      return;
    }

    const confirmed = window.confirm(`Видалити профіль ${this.displayName(currentPerson)}?`);

    if (!confirmed) {
      return;
    }

    try {
      await awaitOne<void>(this.personsService.delete(currentPerson.id));
      await this.router.navigateByUrl("/persons");
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }

  private async loadPage(personId: string): Promise<void> {
    this.errorMessage.set("");

    try {
      const [person, persons, relationships] = await Promise.all([
        awaitOne<Person>(this.personsService.get(personId)),
        awaitOne<Person[]>(this.personsService.list()),
        awaitOne<Relationship[]>(this.relationshipsService.list(personId)),
      ]);

      this.person.set(person);
      this.allPersons.set(persons);
      this.relationships.set(relationships);
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }

  private createRelationshipView(
    relationship: Relationship,
    relatedPersonId: string,
  ): RelationshipView | null {
    const relatedPerson = this.allPersons().find((person) => person.id === relatedPersonId);

    if (!relatedPerson) {
      return null;
    }

    return {
      relationship,
      relatedPerson,
    };
  }
}

interface RelationshipView {
  relationship: Relationship;
  relatedPerson: Person;
}

function buildRelationshipPayload(
  currentPersonId: string,
  value: {
    type: Relationship["type"];
    direction: RelationshipDirection;
    relatedPersonId: string;
    startDate: string;
    endDate: string;
    notes: string;
  },
): CreateRelationshipDto {
  if (value.type === "spouse") {
    return {
      type: "spouse",
      person1Id: currentPersonId,
      person2Id: value.relatedPersonId,
      startDate: emptyToNull(value.startDate),
      endDate: emptyToNull(value.endDate),
      notes: emptyToNull(value.notes),
    };
  }

  const currentIsParent = value.direction === "current_is_parent";

  return {
    type: "parent_child",
    person1Id: currentIsParent ? currentPersonId : value.relatedPersonId,
    person2Id: currentIsParent ? value.relatedPersonId : currentPersonId,
    startDate: emptyToNull(value.startDate),
    endDate: emptyToNull(value.endDate),
    notes: emptyToNull(value.notes),
  };
}

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}
