import type { CreateRelationshipDto, Person, Relationship } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";
import { RelationshipsService } from "../services/relationships.service";

type RelationshipDirection = "current_is_parent" | "current_is_child";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page page-layout">
      <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

      <ng-container *ngIf="person() as person">
        <mat-card class="profile-card">
          <div class="profile-header">
            <div class="profile-copy">
              <h1>{{ displayName(person) }}</h1>
              <p class="muted">{{ person.biography || "Біографія ще не додана." }}</p>
            </div>

            <div class="profile-actions" *ngIf="isOwnProfile(); else readOnlyProfileNotice">
              <a mat-stroked-button color="primary" [routerLink]="['/persons', person.id, 'edit']" class="action-link">Редагувати</a>
              <a mat-button [routerLink]="['/tree', person.id]" class="action-link">Відкрити дерево</a>
              <button mat-stroked-button type="button" class="danger-button" (click)="deletePerson()">Видалити</button>
            </div>

            <ng-template #readOnlyProfileNotice>
              <div class="profile-notice">
                <p class="muted">Щоб прив’язати цю людину до свого дерева, додай зв’язок у блоці нижче.</p>
              </div>
            </ng-template>
          </div>

          <div class="details-grid">
            <mat-card appearance="outlined" class="detail-item"><span>Стать</span><strong>{{ genderLabel(person.gender) }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item"><span>Дата народження</span><strong>{{ person.birthDate || "—" }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item"><span>Дата смерті</span><strong>{{ person.deathDate || "—" }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item"><span>Місце народження</span><strong>{{ person.birthPlace || "—" }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item"><span>Місце смерті</span><strong>{{ person.deathPlace || "—" }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item"><span>Посилання на фото</span><strong>{{ person.photoUrl || "—" }}</strong></mat-card>
          </div>
        </mat-card>

        <mat-card class="relationships-card" *ngIf="isOwnProfile()">
          <div class="section-heading">
            <div>
              <h2>Родинні зв’язки</h2>
              <p class="muted">Зберігаються тільки зв’язки батьки-діти та партнери. Похідні зв’язки окремо не зберігаються.</p>
            </div>
          </div>

          <div class="relationship-groups">
            <div class="relationship-column">
              <div class="column-heading">
                <h3>Батьки</h3>
                <mat-chip-set>
                  <mat-chip>{{ parents().length }}</mat-chip>
                </mat-chip-set>
              </div>
              <div *ngIf="parents().length > 0; else emptyParents">
                <mat-card appearance="outlined" class="relationship-row" *ngFor="let item of parents()">
                  <div>
                    <a mat-button [routerLink]="['/persons', item.relatedPerson.id]" class="person-link">
                      {{ displayName(item.relatedPerson) }}
                    </a>
                    <p class="muted">{{ item.relationship.notes || "Зв’язок батьки-діти" }}</p>
                  </div>
                  <button mat-button type="button" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
                </mat-card>
              </div>
              <ng-template #emptyParents><div class="empty-state">Батьки не вказані.</div></ng-template>
            </div>

            <div class="relationship-column">
              <div class="column-heading">
                <h3>Партнери</h3>
                <mat-chip-set>
                  <mat-chip>{{ spouses().length }}</mat-chip>
                </mat-chip-set>
              </div>
              <div *ngIf="spouses().length > 0; else emptySpouses">
                <mat-card appearance="outlined" class="relationship-row" *ngFor="let item of spouses()">
                  <div>
                    <a mat-button [routerLink]="['/persons', item.relatedPerson.id]" class="person-link">
                      {{ displayName(item.relatedPerson) }}
                    </a>
                    <p class="muted">{{ item.relationship.startDate || "дата не вказана" }}</p>
                  </div>
                  <button mat-button type="button" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
                </mat-card>
              </div>
              <ng-template #emptySpouses><div class="empty-state">Партнери не вказані.</div></ng-template>
            </div>

            <div class="relationship-column">
              <div class="column-heading">
                <h3>Діти</h3>
                <mat-chip-set>
                  <mat-chip>{{ children().length }}</mat-chip>
                </mat-chip-set>
              </div>
              <div *ngIf="children().length > 0; else emptyChildren">
                <mat-card appearance="outlined" class="relationship-row" *ngFor="let item of children()">
                  <div>
                    <a mat-button [routerLink]="['/persons', item.relatedPerson.id]" class="person-link">
                      {{ displayName(item.relatedPerson) }}
                    </a>
                    <p class="muted">{{ item.relationship.notes || "Зв’язок батьки-діти" }}</p>
                  </div>
                  <button mat-button type="button" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
                </mat-card>
              </div>
              <ng-template #emptyChildren><div class="empty-state">Діти не вказані.</div></ng-template>
            </div>
          </div>
        </mat-card>

        <mat-card class="relationship-form-card">
          <div class="section-heading">
            <div>
              <h2>Додати зв’язок</h2>
              <p class="muted">
                {{
                  isOwnProfile()
                    ? "Вкажіть тип і другу людину. Для зв’язку батьки-діти виберіть напрямок."
                    : "Виберіть людину зі свого дерева. Якщо потрібно, цей профіль буде автоматично доданий у ваше дерево під час створення зв’язку."
                }}
              </p>
            </div>
          </div>

          <form [formGroup]="relationshipForm" (ngSubmit)="createRelationship()" class="form-grid">
            <div class="field-grid">
              <mat-form-field appearance="outline">
                <mat-label>Тип зв’язку</mat-label>
                <mat-select id="type" formControlName="type">
                  <mat-option value="parent_child">батьки-діти</mat-option>
                  <mat-option value="spouse">партнери</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" *ngIf="relationshipForm.controls.type.value === 'parent_child'">
                <mat-label>Напрямок</mat-label>
                <mat-select id="direction" formControlName="direction">
                  <mat-option value="current_is_parent">Поточна людина є батьком / матір’ю</mat-option>
                  <mat-option value="current_is_child">Поточна людина є дитиною</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>{{ isOwnProfile() ? "Інша людина" : "Людина з вашого дерева" }}</mat-label>
                <mat-select id="relatedPersonId" formControlName="relatedPersonId">
                  <mat-option value="">Оберіть людину</mat-option>
                  <mat-option *ngFor="let candidate of relationshipCandidates()" [value]="candidate.id">
                    {{ displayName(candidate) }}
                  </mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" *ngIf="relationshipForm.controls.type.value === 'spouse'">
                <mat-label>Дата початку стосунків</mat-label>
                <input matInput id="startDate" type="date" formControlName="startDate">
              </mat-form-field>

              <mat-form-field appearance="outline" *ngIf="relationshipForm.controls.type.value === 'spouse'">
                <mat-label>Дата завершення стосунків</mat-label>
                <input matInput id="endDate" type="date" formControlName="endDate">
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Нотатки</mat-label>
              <textarea matInput id="notes" formControlName="notes"></textarea>
            </mat-form-field>

            <div class="form-actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="relationshipForm.invalid || isSubmittingRelationship()">
                {{ isSubmittingRelationship() ? "Додавання..." : "Додати зв’язок" }}
              </button>
            </div>
          </form>
        </mat-card>
      </ng-container>
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
        padding: clamp(18px, 2.4vw, 24px);
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

      .profile-notice {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .profile-notice p {
        margin: 0;
        max-width: 280px;
      }

      .danger-button {
        border-color: rgba(40, 90, 153, 0.28) !important;
        color: var(--danger) !important;
      }

      .action-link {
        text-decoration: none;
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
        gap: 12px;
      }

      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
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
        grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
        gap: 16px;
      }

      .relationship-column {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .column-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
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
      }

      .relationship-row p {
        margin: 4px 0 0;
      }

      .person-link {
        min-width: 0;
        justify-content: flex-start;
        padding: 0;
        font-weight: 700;
        text-decoration: none;
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

      @media (max-width: 960px) {
        .profile-header {
          flex-direction: column;
        }
      }

      @media (max-width: 860px) {

        .relationship-row {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      @media (max-width: 640px) {
        .profile-header h1 {
          font-size: 30px;
        }

        .profile-actions,
        .form-actions {
          width: 100%;
        }

        .profile-actions > .mat-mdc-button-base,
        .form-actions > .mat-mdc-button-base {
          width: 100%;
          justify-content: center;
        }

        .relationship-row > .mat-mdc-button-base {
          width: 100%;
          justify-content: center;
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
  private readonly snackBar = inject(MatSnackBar);

  readonly person = signal<Person | null>(null);
  readonly allPersons = signal<Person[]>([]);
  readonly relationships = signal<Relationship[]>([]);
  readonly errorMessage = signal("");
  readonly isOwnProfile = signal(false);
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
    this.relationshipForm.controls.type.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((type) => {
      if (type !== "spouse") {
        this.relationshipForm.patchValue({
          startDate: "",
          endDate: "",
        });
      }
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const personId = params.get("id");

      if (personId) {
        void this.loadPage(personId);
      }
    });
  }

  relationshipCandidates(): Person[] {
    const currentId = this.person()?.id;

    if (this.isOwnProfile()) {
      return this.allPersons().filter((candidate) => candidate.id !== currentId);
    }

    return this.allPersons().filter((candidate) => candidate.sourcePersonId !== currentId);
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
      const localCurrentPerson = this.isOwnProfile()
        ? currentPerson
        : await awaitOne<Person>(this.personsService.importDirectoryPerson(currentPerson.id));

      if (localCurrentPerson.id === value.relatedPersonId) {
        this.errorMessage.set("Не можна створити зв’язок людини самої з собою");
        return;
      }

      const payload = buildRelationshipPayload(localCurrentPerson.id, value);
      await awaitOne<Relationship>(this.relationshipsService.create(payload));
      this.resetRelationshipForm();

      if (this.isOwnProfile()) {
        await this.loadPage(currentPerson.id);
      } else {
        this.snackBar.open("Зв’язок додано до вашого дерева", "Закрити", { duration: 3000 });
        await this.router.navigate(["/persons", localCurrentPerson.id]);
      }
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isSubmittingRelationship.set(false);
    }
  }

  async deleteRelationship(relationshipId: string): Promise<void> {
    const currentPerson = this.person();

    if (!currentPerson || !this.isOwnProfile()) {
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

    if (!currentPerson || !this.isOwnProfile()) {
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
    this.person.set(null);
    this.relationships.set([]);
    this.isOwnProfile.set(false);

    try {
      const persons = await awaitOne<Person[]>(this.personsService.list());
      const isOwnProfile = persons.some((person) => person.id === personId);
      const person = isOwnProfile
        ? await awaitOne<Person>(this.personsService.get(personId))
        : await awaitOne<Person>(this.personsService.getDirectoryPerson(personId));
      const relationships = isOwnProfile
        ? await awaitOne<Relationship[]>(this.relationshipsService.list(personId))
        : [];

      this.person.set(person);
      this.allPersons.set(persons);
      this.relationships.set(relationships);
      this.isOwnProfile.set(isOwnProfile);
    } catch (error) {
      this.allPersons.set([]);
      this.person.set(null);
      this.relationships.set([]);
      this.isOwnProfile.set(false);
      this.errorMessage.set(readApiError(error));
    }
  }

  private resetRelationshipForm(): void {
    this.relationshipForm.reset({
      type: "parent_child",
      direction: "current_is_parent",
      relatedPersonId: "",
      startDate: "",
      endDate: "",
      notes: "",
    });
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
