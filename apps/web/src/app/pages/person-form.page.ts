import type { CreatePersonDto, Person } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { AuthService } from "../services/auth.service";
import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";

type LivingOption = "unknown" | "true" | "false";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page">
      <mat-card class="form-shell">
        <div class="form-header">
          <div>
            <mat-chip-set>
              <mat-chip>{{ personId() ? "Редагування" : "Створення" }}</mat-chip>
            </mat-chip-set>
            <h1>{{ personId() ? "Редагувати людину" : "Нова людина" }}</h1>
            <p class="muted">Заповніть базові дані профілю. Для MVP цього достатньо.</p>
          </div>

          <a mat-stroked-button color="primary" routerLink="/persons" class="form-link">До списку</a>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid">
          <div class="field-stack">
            <mat-form-field appearance="outline">
              <mat-label>Ім’я</mat-label>
              <input matInput id="firstName" formControlName="firstName">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Прізвище</mat-label>
              <input matInput id="lastName" formControlName="lastName">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>По батькові / друге ім’я</mat-label>
              <input matInput id="middleName" formControlName="middleName">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Дівоче прізвище</mat-label>
              <input matInput id="maidenName" formControlName="maidenName">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Стать</mat-label>
              <mat-select id="gender" formControlName="gender">
                <mat-option value="unknown">не вказано</mat-option>
                <mat-option value="male">чоловіча</mat-option>
                <mat-option value="female">жіноча</mat-option>
                <mat-option value="other">інша</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Статус життя</mat-label>
              <mat-select id="isLiving" formControlName="isLiving">
                <mat-option value="unknown">не вказано</mat-option>
                <mat-option value="true">живий / жива</mat-option>
                <mat-option value="false">помер / померла</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Дата народження</mat-label>
              <input matInput id="birthDate" type="date" formControlName="birthDate">
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Місце народження</mat-label>
              <input matInput id="birthPlace" formControlName="birthPlace">
            </mat-form-field>

            <ng-container *ngIf="isMarkedDeceased()">
              <mat-form-field appearance="outline">
                <mat-label>Дата смерті</mat-label>
                <input matInput id="deathDate" type="date" formControlName="deathDate">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Місце смерті</mat-label>
                <input matInput id="deathPlace" formControlName="deathPlace">
              </mat-form-field>
            </ng-container>

            <mat-form-field appearance="outline">
              <mat-label>Посилання на фото</mat-label>
              <input matInput id="photoUrl" formControlName="photoUrl">
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline">
            <mat-label>Біографія</mat-label>
            <textarea matInput id="biography" formControlName="biography"></textarea>
          </mat-form-field>

          <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

          <div class="form-actions">
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="form.invalid || isSaving() || isDeletingAccount()"
            >
              {{ isSaving() ? "Збереження..." : "Зберегти" }}
            </button>
          </div>
        </form>

        <mat-card class="danger-zone" appearance="outlined" *ngIf="isOwnProfile()">
          <div class="danger-copy">
            <h2>Видалення акаунту</h2>
            <p class="muted">
              Ця дія видалить ваш акаунт, ваш профіль, усіх людей і всі зв’язки в цьому акаунті.
              Скасувати це не можна.
            </p>
          </div>

          <p class="error-text" *ngIf="deleteAccountError()">{{ deleteAccountError() }}</p>

          <button
            mat-stroked-button
            type="button"
            class="danger-button"
            [disabled]="isSaving() || isDeletingAccount()"
            (click)="deleteCurrentAccount()"
          >
            {{ isDeletingAccount() ? "Видалення..." : "Видалити акаунт" }}
          </button>
        </mat-card>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .form-shell {
        padding: 24px;
      }

      .form-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
      }

      .form-header h1 {
        margin: 0 0 8px;
      }

      .form-header mat-chip-set {
        margin-bottom: 6px;
      }

      .form-grid {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .field-stack {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .form-actions {
        display: flex;
        justify-content: flex-start;
      }

      .danger-zone {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-top: 20px;
        padding: 18px;
        border-color: rgba(182, 79, 79, 0.28);
        background: rgba(255, 246, 246, 0.72);
      }

      .danger-copy h2 {
        margin: 0 0 6px;
        font-size: 20px;
      }

      .danger-copy p {
        margin: 0;
      }

      .danger-button {
        align-self: flex-start;
        border-color: rgba(182, 79, 79, 0.45);
        color: #8f2d2d;
      }

      .form-link {
        text-decoration: none;
      }

      @media (max-width: 720px) {
        .form-header {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class PersonFormPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly personsService = inject(PersonsService);
  private readonly authService = inject(AuthService);

  readonly personId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isDeletingAccount = signal(false);
  readonly errorMessage = signal("");
  readonly deleteAccountError = signal("");

  readonly form = new FormGroup({
    firstName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    lastName: new FormControl("", { nonNullable: true }),
    middleName: new FormControl("", { nonNullable: true }),
    maidenName: new FormControl("", { nonNullable: true }),
    gender: new FormControl<Person["gender"]>("unknown", { nonNullable: true }),
    birthDate: new FormControl("", { nonNullable: true }),
    deathDate: new FormControl("", { nonNullable: true }),
    birthPlace: new FormControl("", { nonNullable: true }),
    deathPlace: new FormControl("", { nonNullable: true }),
    biography: new FormControl("", { nonNullable: true }),
    isLiving: new FormControl<LivingOption>("unknown", { nonNullable: true }),
    photoUrl: new FormControl("", { nonNullable: true }),
  });

  constructor() {
    this.form.controls.isLiving.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (value === "true") {
        this.form.controls.deathDate.setValue("", { emitEvent: false });
        this.form.controls.deathPlace.setValue("", { emitEvent: false });
      }
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get("id");
      this.personId.set(id);

      if (id) {
        void this.loadPerson(id);
      } else {
        this.form.reset({
          firstName: "",
          lastName: "",
          middleName: "",
          maidenName: "",
          gender: "unknown",
          birthDate: "",
          deathDate: "",
          birthPlace: "",
          deathPlace: "",
          biography: "",
          isLiving: "unknown",
          photoUrl: "",
        });
      }
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set("");
    const payload = toPersonPayload(this.form.getRawValue());

    try {
      if (this.personId()) {
        const person = await awaitOne<Person>(this.personsService.update(this.personId()!, payload));
        await this.router.navigate(["/persons", person.id]);
      } else {
        const person = await awaitOne<Person>(this.personsService.create(payload));
        await this.router.navigate(["/persons", person.id]);
      }
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  isMarkedDeceased(): boolean {
    return this.form.controls.isLiving.value === "false";
  }

  isOwnProfile(): boolean {
    return this.personId() !== null && this.personId() === this.authService.user()?.primaryPersonId;
  }

  async deleteCurrentAccount(): Promise<void> {
    if (!this.isOwnProfile()) {
      return;
    }

    const confirmed = window.confirm(
      "Видалити весь акаунт разом із вашим профілем, усіма людьми та всіма зв’язками?",
    );

    if (!confirmed) {
      return;
    }

    this.isDeletingAccount.set(true);
    this.deleteAccountError.set("");

    try {
      await this.authService.deleteAccount();
    } catch (error) {
      this.deleteAccountError.set(readApiError(error));
    } finally {
      this.isDeletingAccount.set(false);
    }
  }

  private async loadPerson(personId: string): Promise<void> {
    this.errorMessage.set("");

    try {
      const person = await awaitOne<Person>(this.personsService.get(personId));
      this.form.reset({
        firstName: person.firstName,
        lastName: person.lastName ?? "",
        middleName: person.middleName ?? "",
        maidenName: person.maidenName ?? "",
        gender: person.gender,
        birthDate: person.birthDate ?? "",
        deathDate: person.deathDate ?? "",
        birthPlace: person.birthPlace ?? "",
        deathPlace: person.deathPlace ?? "",
        biography: person.biography ?? "",
        isLiving: person.isLiving === null ? "unknown" : person.isLiving ? "true" : "false",
        photoUrl: person.photoUrl ?? "",
      });
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }
}

function toPersonPayload(value: {
  firstName: string;
  lastName: string;
  middleName: string;
  maidenName: string;
  gender: Person["gender"];
  birthDate: string;
  deathDate: string;
  birthPlace: string;
  deathPlace: string;
  biography: string;
  isLiving: LivingOption;
  photoUrl: string;
}): CreatePersonDto {
  return {
    firstName: value.firstName,
    lastName: emptyToNull(value.lastName),
    middleName: emptyToNull(value.middleName),
    maidenName: emptyToNull(value.maidenName),
    gender: value.gender,
    birthDate: emptyToNull(value.birthDate),
    deathDate: emptyToNull(value.deathDate),
    birthPlace: emptyToNull(value.birthPlace),
    deathPlace: emptyToNull(value.deathPlace),
    biography: emptyToNull(value.biography),
    isLiving: value.isLiving === "unknown" ? null : value.isLiving === "true",
    photoUrl: emptyToNull(value.photoUrl),
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
