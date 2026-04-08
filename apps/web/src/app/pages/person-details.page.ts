import type {
  CreateRelationshipDto,
  Person,
  Relationship,
  RelationshipDirection,
} from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { buildPhotoInitials, isSupportedPhotoUrl } from "../lib/photo";
import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";
import { RelationshipsService } from "../services/relationships.service";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page page-layout">
      <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

      <ng-container *ngIf="person() as person">
        <mat-card class="profile-card">
          <div class="profile-header">
            <div class="profile-identity">
              <div class="profile-photo-shell">
                <img *ngIf="renderablePhotoUrl(person); else profilePhotoFallback" [src]="renderablePhotoUrl(person)!" alt="Фото людини" class="profile-photo">
                <ng-template #profilePhotoFallback>
                  <div class="profile-photo-fallback">{{ photoInitials(person) }}</div>
                </ng-template>
              </div>

              <div class="profile-copy">
                <h1>{{ displayName(person) }}</h1>
                <p class="muted">{{ person.biography || "Біографія ще не додана." }}</p>
              </div>
            </div>

            <div class="profile-actions" *ngIf="isOwnProfile(); else readOnlyProfileNotice">
              <a mat-stroked-button color="primary" [routerLink]="['/persons', person.id, 'edit']" class="action-link">Редагувати</a>
              <a mat-button [routerLink]="['/tree', person.id]" class="action-link">Відкрити дерево</a>
              <a mat-button [routerLink]="['/graph', person.id]" class="action-link">Мережа родини</a>
              <button mat-stroked-button type="button" class="danger-button" (click)="deletePerson()">Видалити</button>
            </div>

            <ng-template #readOnlyProfileNotice>
              <div class="profile-notice">
                <p class="muted">Профіль уже є в спільному дереві. Щоб пов’язати його зі своєю гілкою, створи зв’язок нижче.</p>
                <a mat-button [routerLink]="['/graph', person.id]" class="action-link">Подивитися всю мережу родини</a>
              </div>
            </ng-template>
          </div>

          <div class="details-grid">
            <mat-card appearance="outlined" class="detail-item"><span>Стать</span><strong>{{ genderLabel(person.gender) }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item"><span>Дата народження</span><strong>{{ person.birthDate || "—" }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item" *ngIf="person.deathDate"><span>Дата смерті</span><strong>{{ person.deathDate }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item"><span>Місце народження</span><strong>{{ person.birthPlace || "—" }}</strong></mat-card>
            <mat-card appearance="outlined" class="detail-item" *ngIf="person.deathPlace"><span>Місце смерті</span><strong>{{ person.deathPlace }}</strong></mat-card>
          </div>
        </mat-card>

        <mat-card class="quick-add-card">
          <div class="section-heading">
            <div>
              <h2>Швидко додати нового родича</h2>
              <p class="muted">
                Якщо цієї людини ще немає в базі, починай звідси: ми одразу створимо профіль і правильно прив’яжемо
                його до {{ displayName(person) }}.
              </p>
            </div>
          </div>

          <div class="quick-add-actions">
            <button mat-stroked-button type="button" (click)="goToCreateRelative('parents')">Додати батька / матір</button>
            <button mat-stroked-button type="button" (click)="goToCreateRelative('children')">Додати дитину</button>
            <button mat-stroked-button type="button" (click)="goToCreateRelative('spouses')">Додати партнера / партнерку</button>
          </div>
        </mat-card>

        <mat-card class="relationships-card">
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
              </div>
              <div
                class="relationship-dropzone"
                [class.relationship-dropzone--active]="activeDropGroup() === 'parents'"
                [class.relationship-dropzone--dragging]="!!draggedRelationshipId()"
                (dragover)="onRelationshipDragOver($event)"
                (dragenter)="onRelationshipDragEnter('parents', $event)"
                (drop)="onRelationshipDrop('parents', $event)"
              >
                <ng-container *ngIf="parents().length > 0; else emptyParents">
                  <mat-card
                    appearance="outlined"
                    class="relationship-row"
                    *ngFor="let item of parents()"
                    [class.relationship-row--dragging]="draggedRelationshipId() === item.relationship.id"
                    [attr.draggable]="isOwnProfile() && !isSubmittingRelationship()"
                    (dragstart)="onRelationshipDragStart($event, item)"
                    (dragend)="onRelationshipDragEnd()"
                  >
                    <div class="relationship-row-main">
                      <div>
                        <a mat-button [routerLink]="['/persons', item.relatedPerson.id]" class="person-link">
                          {{ displayName(item.relatedPerson) }}
                        </a>
                        <p class="muted">{{ item.relationship.notes || "Зв’язок батьки-діти" }}</p>
                      </div>
                    </div>
                    <button *ngIf="isOwnProfile()" mat-button type="button" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
                  </mat-card>
                </ng-container>
              </div>
              <ng-template #emptyParents><div class="empty-state">Батьки не вказані.</div></ng-template>
            </div>

            <div class="relationship-column">
              <div class="column-heading">
                <h3>Партнери</h3>
              </div>
              <div
                class="relationship-dropzone"
                [class.relationship-dropzone--active]="activeDropGroup() === 'spouses'"
                [class.relationship-dropzone--dragging]="!!draggedRelationshipId()"
                (dragover)="onRelationshipDragOver($event)"
                (dragenter)="onRelationshipDragEnter('spouses', $event)"
                (drop)="onRelationshipDrop('spouses', $event)"
              >
                <ng-container *ngIf="spouses().length > 0; else emptySpouses">
                  <mat-card
                    appearance="outlined"
                    class="relationship-row"
                    *ngFor="let item of spouses()"
                    [class.relationship-row--dragging]="draggedRelationshipId() === item.relationship.id"
                    [attr.draggable]="isOwnProfile() && !isSubmittingRelationship()"
                    (dragstart)="onRelationshipDragStart($event, item)"
                    (dragend)="onRelationshipDragEnd()"
                  >
                    <div class="relationship-row-main">
                      <div>
                        <a mat-button [routerLink]="['/persons', item.relatedPerson.id]" class="person-link">
                          {{ displayName(item.relatedPerson) }}
                        </a>
                        <p class="muted">{{ item.relationship.startDate || "дата не вказана" }}</p>
                      </div>
                    </div>
                    <button *ngIf="isOwnProfile()" mat-button type="button" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
                  </mat-card>
                </ng-container>
              </div>
              <ng-template #emptySpouses><div class="empty-state">Партнери не вказані.</div></ng-template>
            </div>

            <div class="relationship-column">
              <div class="column-heading">
                <h3>Діти</h3>
              </div>
              <div
                class="relationship-dropzone"
                [class.relationship-dropzone--active]="activeDropGroup() === 'children'"
                [class.relationship-dropzone--dragging]="!!draggedRelationshipId()"
                (dragover)="onRelationshipDragOver($event)"
                (dragenter)="onRelationshipDragEnter('children', $event)"
                (drop)="onRelationshipDrop('children', $event)"
              >
                <ng-container *ngIf="children().length > 0; else emptyChildren">
                  <mat-card
                    appearance="outlined"
                    class="relationship-row"
                    *ngFor="let item of children()"
                    [class.relationship-row--dragging]="draggedRelationshipId() === item.relationship.id"
                    [attr.draggable]="isOwnProfile() && !isSubmittingRelationship()"
                    (dragstart)="onRelationshipDragStart($event, item)"
                    (dragend)="onRelationshipDragEnd()"
                  >
                    <div class="relationship-row-main">
                      <div>
                        <a mat-button [routerLink]="['/persons', item.relatedPerson.id]" class="person-link">
                          {{ displayName(item.relatedPerson) }}
                        </a>
                        <p class="muted">{{ item.relationship.notes || "Зв’язок батьки-діти" }}</p>
                      </div>
                    </div>
                    <button *ngIf="isOwnProfile()" mat-button type="button" (click)="deleteRelationship(item.relationship.id)">Видалити</button>
                  </mat-card>
                </ng-container>
              </div>
              <ng-template #emptyChildren><div class="empty-state">Діти не вказані.</div></ng-template>
            </div>
          </div>
        </mat-card>

        <mat-card class="relationship-form-card">
          <div class="section-heading">
            <div>
              <h2>Зв’язати з наявною людиною для {{ displayName(person) }}</h2>
              <p class="muted">
                {{ relationshipFormDescription() }}
              </p>
            </div>
          </div>

          <form [formGroup]="relationshipForm" (ngSubmit)="createRelationship()" class="form-grid">
            <div class="relationship-mode-picker">
              <button
                mat-stroked-button
                type="button"
                class="relationship-mode-button"
                [class.relationship-mode-button--active]="selectedRelationshipGroup() === 'parents'"
                (click)="selectRelationshipGroup('parents')"
              >
                Додати батька / матір
              </button>
              <button
                mat-stroked-button
                type="button"
                class="relationship-mode-button"
                [class.relationship-mode-button--active]="selectedRelationshipGroup() === 'children'"
                (click)="selectRelationshipGroup('children')"
              >
                Додати дитину
              </button>
              <button
                mat-stroked-button
                type="button"
                class="relationship-mode-button"
                [class.relationship-mode-button--active]="selectedRelationshipGroup() === 'spouses'"
                (click)="selectRelationshipGroup('spouses')"
              >
                Додати партнера / партнерку
              </button>
            </div>

            <div class="field-grid">
              <mat-form-field appearance="outline">
                <mat-label>{{ relationshipCandidateLabel() }}</mat-label>
                <input
                  matInput
                  id="relatedPersonQuery"
                  type="text"
                  formControlName="relatedPersonQuery"
                  [matAutocomplete]="relationshipAutocomplete"
                  (input)="onRelationshipQueryInput($event)"
                  placeholder="Почніть вводити ім’я або прізвище"
                >
                <mat-autocomplete #relationshipAutocomplete="matAutocomplete" (optionSelected)="selectRelationshipCandidate($event.option.value)">
                  <mat-option *ngFor="let candidate of filteredRelationshipCandidates()" [value]="candidate.id">
                    {{ displayName(candidate) }}
                  </mat-option>
                </mat-autocomplete>
              </mat-form-field>

              <mat-form-field appearance="outline" *ngIf="selectedRelationshipGroup() === 'spouses'">
                <mat-label>Дата початку стосунків</mat-label>
                <input matInput id="startDate" type="date" formControlName="startDate">
              </mat-form-field>

              <mat-form-field appearance="outline" *ngIf="selectedRelationshipGroup() === 'spouses'">
                <mat-label>Дата завершення стосунків</mat-label>
                <input matInput id="endDate" type="date" formControlName="endDate">
              </mat-form-field>
            </div>

            <div class="relationship-preview" *ngIf="relationshipPreviewText() as preview">
              {{ preview }}
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Нотатки</mat-label>
              <textarea matInput id="notes" formControlName="notes"></textarea>
            </mat-form-field>

            <div class="form-actions">
              <button mat-flat-button color="primary" type="submit" [disabled]="relationshipForm.invalid || isSubmittingRelationship()">
                {{ isSubmittingRelationship() ? "Збереження..." : submitRelationshipLabel() }}
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
      .quick-add-card,
      .relationships-card,
      .relationship-form-card {
        padding: clamp(20px, 2.8vw, 28px);
        border: 1px solid rgba(127, 160, 200, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 251, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.22), transparent 42%);
      }

      .profile-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      .profile-identity {
        display: flex;
        align-items: center;
        gap: 18px;
        min-width: 0;
      }

      .profile-photo-shell {
        width: 120px;
        height: 120px;
        flex: 0 0 auto;
        overflow: hidden;
        border-radius: 32px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background: linear-gradient(180deg, rgba(233, 241, 251, 0.92), rgba(219, 233, 248, 0.92));
        box-shadow: 0 16px 34px rgba(41, 69, 103, 0.12);
      }

      .profile-photo,
      .profile-photo-fallback {
        width: 100%;
        height: 100%;
      }

      .profile-photo {
        display: block;
        object-fit: cover;
      }

      .profile-photo-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        font-weight: 800;
        color: #234261;
      }

      .profile-copy {
        min-width: 0;
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
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(243, 248, 255, 0.92);
        border: 1px solid rgba(127, 160, 200, 0.14);
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
        gap: 14px;
      }

      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.18), transparent 42%);
        border-color: rgba(127, 160, 200, 0.16) !important;
      }

      .detail-item span {
        color: var(--muted);
        font-size: 13px;
      }

      .section-heading {
        margin-bottom: 16px;
      }

      .quick-add-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .relationship-groups {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
        gap: 18px;
      }

      .relationship-column {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        border-radius: 22px;
        border: 1px solid rgba(127, 160, 200, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 251, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.22), transparent 42%);
      }

      .column-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-inline: 2px;
      }

      .relationship-column h3 {
        margin: 0;
      }

      .relationship-dropzone {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 92px;
        padding: 6px;
        border-radius: 18px;
        transition: background-color 160ms ease, box-shadow 160ms ease;
      }

      .relationship-dropzone--active {
        background: rgba(225, 237, 252, 0.72);
        box-shadow: inset 0 0 0 1px rgba(127, 160, 200, 0.22);
      }

      .relationship-dropzone--dragging .relationship-row,
      .relationship-dropzone--dragging .relationship-row * {
        pointer-events: none;
      }

      .relationship-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.18), transparent 42%);
        border-color: rgba(127, 160, 200, 0.16) !important;
        cursor: grab;
      }

      .relationship-row-main {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .relationship-row p {
        margin: 4px 0 0;
      }

      .relationship-row--dragging {
        opacity: 0.45;
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

      .relationship-mode-picker {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .relationship-mode-button {
        min-height: 52px;
        justify-content: center;
        text-align: center;
        border-color: rgba(127, 160, 200, 0.18) !important;
        background: rgba(255, 255, 255, 0.82);
      }

      .relationship-mode-button--active {
        background: rgba(226, 237, 252, 0.92) !important;
        border-color: rgba(67, 118, 182, 0.34) !important;
        color: #1d4c85 !important;
      }

      .relationship-preview {
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(127, 160, 200, 0.14);
        background:
          linear-gradient(180deg, rgba(247, 251, 255, 0.98), rgba(241, 247, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.16), transparent 42%);
        color: #234261;
        font-weight: 600;
      }

      .form-actions {
        display: flex;
        justify-content: flex-start;
      }

      @media (max-width: 960px) {
        .profile-header {
          flex-direction: column;
        }

        .profile-identity {
          width: 100%;
        }
      }

      @media (max-width: 860px) {

        .relationship-row {
          flex-direction: column;
          align-items: flex-start;
        }

        .relationship-row-main {
          width: 100%;
        }
      }

      @media (max-width: 640px) {
        .profile-identity {
          flex-direction: column;
          align-items: flex-start;
        }

        .profile-photo-shell {
          width: 104px;
          height: 104px;
          border-radius: 28px;
        }

        .profile-header h1 {
          font-size: 30px;
        }

        .profile-actions,
        .form-actions {
          width: 100%;
        }

        .relationship-mode-picker {
          grid-template-columns: 1fr;
        }

        .quick-add-actions {
          grid-template-columns: 1fr;
        }

        .profile-actions > .mat-mdc-button-base,
        .quick-add-actions > .mat-mdc-button-base,
        .relationship-mode-picker > .mat-mdc-button-base,
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
  readonly draggedRelationshipId = signal<string | null>(null);
  readonly activeDropGroup = signal<RelationshipGroup | null>(null);

  readonly relationshipForm = new FormGroup({
    type: new FormControl<Relationship["type"]>("parent_child", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    direction: new FormControl<RelationshipDirection>("current_is_child", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    relatedPersonId: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    relatedPersonQuery: new FormControl("", { nonNullable: true }),
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

    return this.allPersons().filter((candidate) => candidate.id !== currentId && candidate.canEdit === true);
  }

  filteredRelationshipCandidates(): Person[] {
    const query = this.relationshipForm.controls.relatedPersonQuery.value.trim().toLocaleLowerCase("uk");
    const candidates = this.relationshipCandidates();

    if (!query) {
      return candidates;
    }

    return candidates.filter((candidate) => {
      const haystack = [
        candidate.firstName,
        candidate.middleName,
        candidate.lastName,
        candidate.maidenName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("uk");

      return haystack.includes(query);
    });
  }

  selectedRelationshipGroup(): RelationshipGroup {
    const { type, direction } = this.relationshipForm.getRawValue();

    if (type === "spouse") {
      return "spouses";
    }

    return direction === "current_is_parent" ? "children" : "parents";
  }

  selectRelationshipGroup(group: RelationshipGroup): void {
    if (group === "spouses") {
      this.relationshipForm.patchValue({
        type: "spouse",
      });
      return;
    }

    this.relationshipForm.patchValue({
      type: "parent_child",
      direction: group === "children" ? "current_is_parent" : "current_is_child",
    });
  }

  relationshipCandidateLabel(): string {
    switch (this.selectedRelationshipGroup()) {
      case "parents":
        return "Оберіть батька або матір";
      case "children":
        return "Оберіть дитину";
      case "spouses":
        return this.isOwnProfile() ? "Оберіть партнера або партнерку" : "Оберіть людину зі свого дерева";
    }
  }

  relationshipFormDescription(): string {
    const baseText = (() => {
      switch (this.selectedRelationshipGroup()) {
        case "parents":
          return "Оберіть людину, яку потрібно додати до батьків поточного профілю.";
        case "children":
          return "Оберіть людину, яку потрібно додати до дітей поточного профілю.";
        case "spouses":
          return "Оберіть людину, яку потрібно пов’язати як партнера або партнерку.";
      }
    })();

    return baseText;
  }

  relationshipPreviewText(): string | null {
    const currentPerson = this.person();
    const relatedPerson = this.selectedRelationshipCandidate();

    if (!currentPerson || !relatedPerson) {
      return null;
    }

    const currentName = this.displayName(currentPerson);
    const relatedName = this.displayName(relatedPerson);

    switch (this.selectedRelationshipGroup()) {
      case "parents":
        return `${relatedName} буде додано до батьків ${currentName}.`;
      case "children":
        return `${relatedName} буде додано до дітей ${currentName}.`;
      case "spouses":
        return `${currentName} і ${relatedName} будуть пов’язані як партнери.`;
    }
  }

  submitRelationshipLabel(): string {
    switch (this.selectedRelationshipGroup()) {
      case "parents":
        return "Додати до батьків";
      case "children":
        return "Додати до дітей";
      case "spouses":
        return "Додати партнера / партнерку";
    }
  }

  async goToCreateRelative(group: RelationshipGroup): Promise<void> {
    const currentPerson = this.person();

    if (!currentPerson) {
      return;
    }

    await this.router.navigate(["/persons/new"], {
      queryParams: {
        relatedTo: currentPerson.id,
        group,
      },
    });
  }

  parents(): RelationshipView[] {
    const current = this.person();

    if (!current) {
      return [];
    }

    return this.relationships()
      .filter((relationship) => relationship.type === "parent_child" && relationship.person2Id === current.id)
      .map((relationship) => this.createRelationshipView(relationship, relationship.person1Id, "parents"))
      .filter(Boolean) as RelationshipView[];
  }

  children(): RelationshipView[] {
    const current = this.person();

    if (!current) {
      return [];
    }

    return this.relationships()
      .filter((relationship) => relationship.type === "parent_child" && relationship.person1Id === current.id)
      .map((relationship) => this.createRelationshipView(relationship, relationship.person2Id, "children"))
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
        return this.createRelationshipView(relationship, relatedPersonId, "spouses");
      })
      .filter(Boolean) as RelationshipView[];
  }

  displayName(person: Person): string {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
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
      this.resetRelationshipForm();
      this.snackBar.open("Зв’язок збережено", "Закрити", { duration: 3000 });
      await this.loadPage(currentPerson.id);
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

  onRelationshipDragStart(event: DragEvent, relationshipView: RelationshipView): void {
    if (!this.isOwnProfile() || this.isSubmittingRelationship()) {
      event.preventDefault();
      return;
    }

    this.draggedRelationshipId.set(relationshipView.relationship.id);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", relationshipView.relationship.id);
    }
  }

  onRelationshipDragEnd(): void {
    this.draggedRelationshipId.set(null);
    this.activeDropGroup.set(null);
  }

  onRelationshipDragOver(event: DragEvent): void {
    if (!this.draggedRelationshipId()) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  onRelationshipDragEnter(group: RelationshipGroup, event: DragEvent): void {
    if (!this.draggedRelationshipId()) {
      return;
    }

    event.preventDefault();
    this.activeDropGroup.set(group);
  }

  async onRelationshipDrop(targetGroup: RelationshipGroup, event: DragEvent): Promise<void> {
    event.preventDefault();

    const currentPerson = this.person();
    const relationshipId = this.draggedRelationshipId();
    const relationshipView = relationshipId ? this.findRelationshipViewByRelationshipId(relationshipId) : null;

    if (
      !currentPerson ||
      !this.isOwnProfile() ||
      !relationshipView ||
      relationshipView.group === targetGroup ||
      this.isSubmittingRelationship()
    ) {
      this.activeDropGroup.set(null);
      return;
    }

    this.isSubmittingRelationship.set(true);
    this.errorMessage.set("");

    try {
      await awaitOne<Relationship>(
        this.relationshipsService.update(
          relationshipView.relationship.id,
          buildRelationshipPayloadForGroup(currentPerson.id, relationshipView, targetGroup),
        ),
      );
      this.snackBar.open("Зв’язок оновлено", "Закрити", { duration: 2500 });
      await this.loadPage(currentPerson.id);
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isSubmittingRelationship.set(false);
      this.draggedRelationshipId.set(null);
      this.activeDropGroup.set(null);
    }
  }

  onRelationshipQueryInput(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target.value : "";
    const selectedCandidate = this.selectedRelationshipCandidate();

    if (!selectedCandidate) {
      this.relationshipForm.controls.relatedPersonId.setValue("");
      return;
    }

    if (input !== this.displayName(selectedCandidate)) {
      this.relationshipForm.controls.relatedPersonId.setValue("");
    }
  }

  selectRelationshipCandidate(personId: string): void {
    const candidate = this.relationshipCandidates().find((person) => person.id === personId);

    if (!candidate) {
      this.relationshipForm.controls.relatedPersonId.setValue("");
      return;
    }

    this.relationshipForm.patchValue({
      relatedPersonId: candidate.id,
      relatedPersonQuery: this.displayName(candidate),
    });
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
      const person = await awaitOne<Person>(this.personsService.get(personId));
      const relationships = await awaitOne<Relationship[]>(this.relationshipsService.list(personId));

      this.person.set(person);
      this.allPersons.set(persons);
      this.relationships.set(relationships);
      this.isOwnProfile.set(person.canEdit === true);
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
      direction: "current_is_child",
      relatedPersonId: "",
      relatedPersonQuery: "",
      startDate: "",
      endDate: "",
      notes: "",
    });
  }

  private createRelationshipView(
    relationship: Relationship,
    relatedPersonId: string,
    group: RelationshipGroup,
  ): RelationshipView | null {
    const relatedPerson = this.allPersons().find((person) => person.id === relatedPersonId);

    if (!relatedPerson) {
      return null;
    }

    return {
      group,
      relationship,
      relatedPerson,
    };
  }

  private findRelationshipViewByRelationshipId(relationshipId: string): RelationshipView | null {
    return [...this.parents(), ...this.spouses(), ...this.children()].find(
      (item) => item.relationship.id === relationshipId,
    ) ?? null;
  }

  private selectedRelationshipCandidate(): Person | null {
    const relatedPersonId = this.relationshipForm.controls.relatedPersonId.value;

    if (!relatedPersonId) {
      return null;
    }

    return this.relationshipCandidates().find((candidate) => candidate.id === relatedPersonId) ?? null;
  }
}

interface RelationshipView {
  group: RelationshipGroup;
  relationship: Relationship;
  relatedPerson: Person;
}

type RelationshipGroup = "parents" | "spouses" | "children";

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

function buildRelationshipPayloadForGroup(
  currentPersonId: string,
  relationshipView: RelationshipView,
  targetGroup: RelationshipGroup,
): CreateRelationshipDto {
  if (targetGroup === "spouses") {
    return {
      type: "spouse",
      person1Id: currentPersonId,
      person2Id: relationshipView.relatedPerson.id,
      startDate: relationshipView.group === "spouses" ? relationshipView.relationship.startDate : null,
      endDate: relationshipView.group === "spouses" ? relationshipView.relationship.endDate : null,
      notes: relationshipView.relationship.notes,
    };
  }

  return {
    type: "parent_child",
    person1Id: targetGroup === "children" ? currentPersonId : relationshipView.relatedPerson.id,
    person2Id: targetGroup === "children" ? relationshipView.relatedPerson.id : currentPersonId,
    startDate: null,
    endDate: null,
    notes: relationshipView.relationship.notes,
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
