import type { CreatePersonDto, Person } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";

type LivingOption = "unknown" | "true" | "false";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="app-page">
      <section class="card form-shell">
        <div class="form-header">
          <div>
            <span class="chip">{{ personId() ? "Редагування" : "Створення" }}</span>
            <h1>{{ personId() ? "Редагувати людину" : "Нова людина" }}</h1>
            <p class="muted">Заповніть базові дані профілю. Для MVP цього достатньо.</p>
          </div>

          <a routerLink="/persons" class="btn btn-secondary form-link">До списку</a>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid">
          <div class="field-grid">
            <div class="field">
              <label for="firstName">Ім’я</label>
              <input id="firstName" formControlName="firstName">
            </div>

            <div class="field">
              <label for="lastName">Прізвище</label>
              <input id="lastName" formControlName="lastName">
            </div>

            <div class="field">
              <label for="middleName">По батькові / middle name</label>
              <input id="middleName" formControlName="middleName">
            </div>

            <div class="field">
              <label for="maidenName">Дівоче прізвище</label>
              <input id="maidenName" formControlName="maidenName">
            </div>

            <div class="field">
              <label for="gender">Стать</label>
              <select id="gender" formControlName="gender">
                <option value="unknown">unknown</option>
                <option value="male">male</option>
                <option value="female">female</option>
                <option value="other">other</option>
              </select>
            </div>

            <div class="field">
              <label for="isLiving">Статус життя</label>
              <select id="isLiving" formControlName="isLiving">
                <option value="unknown">не вказано</option>
                <option value="true">живий / жива</option>
                <option value="false">помер / померла</option>
              </select>
            </div>

            <div class="field">
              <label for="birthDate">Дата народження</label>
              <input id="birthDate" type="date" formControlName="birthDate">
            </div>

            <div class="field">
              <label for="deathDate">Дата смерті</label>
              <input id="deathDate" type="date" formControlName="deathDate">
            </div>

            <div class="field">
              <label for="birthPlace">Місце народження</label>
              <input id="birthPlace" formControlName="birthPlace">
            </div>

            <div class="field">
              <label for="deathPlace">Місце смерті</label>
              <input id="deathPlace" formControlName="deathPlace">
            </div>

            <div class="field">
              <label for="photoUrl">Photo URL</label>
              <input id="photoUrl" formControlName="photoUrl">
            </div>
          </div>

          <div class="field">
            <label for="biography">Біографія</label>
            <textarea id="biography" formControlName="biography"></textarea>
          </div>

          <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="form.invalid || isSaving()">
              {{ isSaving() ? "Збереження..." : "Зберегти" }}
            </button>
          </div>
        </form>
      </section>
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
        margin: 12px 0 8px;
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

  readonly personId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly errorMessage = signal("");

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
