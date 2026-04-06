import type {
  CreateUserDto,
  Person,
  RegistrationPersonCandidate,
  RegistrationPersonMode,
  UserAccount,
} from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { UsersService } from "../services/users.service";

type LivingOption = "unknown" | "true" | "false";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page">
      <mat-card class="user-form-shell">
        <div class="form-header">
          <div>
            <mat-chip-set>
              <mat-chip>Користувачі</mat-chip>
            </mat-chip-set>
            <h1>Новий користувач</h1>
            <p class="muted">
              Створіть обліковий запис і відразу визначте, хто ви в дереві: оберіть наявну картку або
              створіть свою базову картку.
            </p>
          </div>

          <div class="header-actions">
            <a mat-stroked-button color="primary" routerLink="/login">До входу</a>
          </div>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid">
          <mat-card appearance="outlined" class="section-card">
            <div class="section-copy">
              <h2>Обліковий запис</h2>
              <p class="muted">Ці дані будуть використовуватись для входу в систему.</p>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Електронна пошта</mat-label>
              <input matInput type="email" formControlName="email">
            </mat-form-field>

            <div class="field-grid">
              <mat-form-field appearance="outline">
                <mat-label>Пароль</mat-label>
                <input matInput type="password" formControlName="password">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Підтвердження пароля</mat-label>
                <input matInput type="password" formControlName="confirmPassword">
              </mat-form-field>
            </div>
          </mat-card>

          <mat-card appearance="outlined" class="section-card">
            <div class="section-copy">
              <h2>Хто ви в дереві</h2>
              <p class="muted">
                Обрана або створена картка стане центральною людиною вашого акаунту і відкриється як
                “Мій профіль”.
              </p>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Як додати вас до дерева</mat-label>
              <mat-select formControlName="personMode">
                <mat-option value="new">Створити мою картку</mat-option>
                <mat-option value="existing">Я вже є у списку</mat-option>
              </mat-select>
            </mat-form-field>

            <ng-container *ngIf="isExistingMode(); else createPersonFields">
              <mat-form-field appearance="outline" class="field-wide">
                <mat-label>Пошук себе у загальній базі</mat-label>
                <input
                  matInput
                  formControlName="searchQuery"
                  placeholder="Почніть вводити прізвище або ім’я"
                  [matAutocomplete]="personAutocomplete"
                >
                <mat-autocomplete
                  #personAutocomplete="matAutocomplete"
                  [displayWith]="displaySelectedCandidate"
                  (optionSelected)="selectCandidate($event.option.value)"
                >
                  <mat-option *ngFor="let candidate of searchResults()" [value]="candidate">
                    <div class="candidate-option">
                      <span class="candidate-title">{{ candidateHeadline(candidate) }}</span>
                      <span class="candidate-meta">{{ candidateDetails(candidate) }}</span>
                    </div>
                  </mat-option>
                </mat-autocomplete>
              </mat-form-field>

              <mat-progress-bar *ngIf="isSearching()" mode="indeterminate"></mat-progress-bar>

              <p class="muted helper-text">
                Введіть щонайменше 3 літери. Пошук виконується на бекенді по всій базі людей.
              </p>

              <p class="error-text" *ngIf="searchErrorMessage()">{{ searchErrorMessage() }}</p>

              <p class="muted helper-text" *ngIf="hasSearched() && !isSearching() && searchResults().length === 0">
                Збігів не знайдено. Перемкніться на створення нової картки і введіть свої дані вручну.
              </p>

              <p class="error-text" *ngIf="showExistingSelectionError()">
                Оберіть себе зі списку або створіть нову картку.
              </p>
            </ng-container>

            <ng-template #createPersonFields>
              <div class="field-grid">
                <mat-form-field appearance="outline">
                  <mat-label>Ім’я</mat-label>
                  <input matInput formControlName="firstName">
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Прізвище</mat-label>
                  <input matInput formControlName="lastName">
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>По батькові / друге ім’я</mat-label>
                  <input matInput formControlName="middleName">
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Дівоче прізвище</mat-label>
                  <input matInput formControlName="maidenName">
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Стать</mat-label>
                  <mat-select formControlName="gender">
                    <mat-option value="unknown">не вказано</mat-option>
                    <mat-option value="male">чоловіча</mat-option>
                    <mat-option value="female">жіноча</mat-option>
                    <mat-option value="other">інша</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Статус життя</mat-label>
                  <mat-select formControlName="isLiving">
                    <mat-option value="true">живий / жива</mat-option>
                    <mat-option value="false">помер / померла</mat-option>
                    <mat-option value="unknown">не вказано</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Дата народження</mat-label>
                  <input matInput type="date" formControlName="birthDate">
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Місце народження</mat-label>
                  <input matInput formControlName="birthPlace">
                </mat-form-field>
              </div>
            </ng-template>
          </mat-card>

          <p class="error-text" *ngIf="showPasswordMismatch()">Паролі не збігаються</p>
          <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

          <div class="form-actions">
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="form.invalid || isSaving() || passwordsMismatch()"
            >
              {{ isSaving() ? "Створення..." : "Створити акаунт" }}
            </button>
          </div>
        </form>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .user-form-shell {
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

      .header-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .form-grid {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .section-card {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 18px;
      }

      .section-copy h2 {
        margin: 0 0 6px;
        font-size: 20px;
      }

      .section-copy p {
        margin: 0;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .search-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: start;
      }

      .field-wide {
        min-width: 0;
      }

      .search-button {
        min-height: 56px;
      }

      .candidate-option {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-block: 4px;
      }

      .candidate-title {
        font-weight: 700;
        color: var(--text);
      }

      .candidate-meta {
        font-size: 13px;
        color: var(--muted);
      }

      .helper-text {
        margin: 0;
      }

      .form-actions {
        display: flex;
        justify-content: flex-start;
      }

      @media (max-width: 720px) {
        .form-header {
          flex-direction: column;
        }

        .field-grid,
        .search-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class UserCreatePageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly usersService = inject(UsersService);
  private readonly router = inject(Router);
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private latestSearchToken = 0;

  readonly isSaving = signal(false);
  readonly isSearching = signal(false);
  readonly hasSearched = signal(false);
  readonly errorMessage = signal("");
  readonly searchErrorMessage = signal("");
  readonly searchResults = signal<RegistrationPersonCandidate[]>([]);

  readonly form = new FormGroup({
    email: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
    confirmPassword: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    personMode: new FormControl<RegistrationPersonMode>("new", {
      nonNullable: true,
    }),
    searchQuery: new FormControl<string | RegistrationPersonCandidate>("", { nonNullable: true }),
    existingPersonId: new FormControl("", { nonNullable: true }),
    firstName: new FormControl("", { nonNullable: true }),
    lastName: new FormControl("", { nonNullable: true }),
    middleName: new FormControl("", { nonNullable: true }),
    maidenName: new FormControl("", { nonNullable: true }),
    gender: new FormControl<Person["gender"]>("unknown", { nonNullable: true }),
    birthDate: new FormControl("", { nonNullable: true }),
    birthPlace: new FormControl("", { nonNullable: true }),
    isLiving: new FormControl<LivingOption>("true", { nonNullable: true }),
  });

  constructor() {
    this.applyPersonMode(this.form.controls.personMode.value);

    this.form.controls.personMode.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((mode) => {
      this.errorMessage.set("");
      this.applyPersonMode(mode);
    });

    this.form.controls.searchQuery.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (!this.isExistingMode()) {
        return;
      }

      if (typeof value !== "string") {
        this.searchErrorMessage.set("");
        this.isSearching.set(false);
        return;
      }

      const query = value.trim();
      this.clearSearchDebounce();
      this.latestSearchToken += 1;
      this.searchErrorMessage.set("");
      this.form.controls.existingPersonId.setValue("", { emitEvent: false });

      if (query.length < 3) {
        this.hasSearched.set(false);
        this.searchResults.set([]);
        this.isSearching.set(false);
        return;
      }

      const searchToken = this.latestSearchToken;
      this.hasSearched.set(true);
      this.isSearching.set(true);
      this.searchResults.set([]);
      this.searchDebounceTimer = setTimeout(() => {
        void this.fetchSearchResults(query, searchToken);
      }, 250);
    });
  }

  passwordsMismatch(): boolean {
    const { password, confirmPassword } = this.form.getRawValue();
    return password !== confirmPassword;
  }

  showPasswordMismatch(): boolean {
    const confirmPasswordControl = this.form.controls.confirmPassword;
    return this.passwordsMismatch() && (confirmPasswordControl.touched || confirmPasswordControl.dirty);
  }

  isExistingMode(): boolean {
    return this.form.controls.personMode.value === "existing";
  }

  showExistingSelectionError(): boolean {
    const control = this.form.controls.existingPersonId;
    return this.isExistingMode() && control.invalid && (control.touched || control.dirty);
  }

  displaySelectedCandidate = (candidate: RegistrationPersonCandidate | string | null): string => {
    if (!candidate) {
      return "";
    }

    return typeof candidate === "string" ? candidate : this.candidateHeadline(candidate);
  };

  candidateHeadline(candidate: RegistrationPersonCandidate): string {
    return [candidate.lastName, candidate.firstName, candidate.middleName].filter(Boolean).join(" ");
  }

  candidateDetails(candidate: RegistrationPersonCandidate): string {
    const details = [candidate.birthDate, candidate.birthPlace].filter(Boolean);
    return details.length > 0 ? details.join(" • ") : "Дата та місто народження не вказані";
  }

  selectCandidate(candidate: RegistrationPersonCandidate): void {
    this.form.controls.searchQuery.setValue(candidate, { emitEvent: false });
    this.form.controls.existingPersonId.setValue(candidate.sourcePersonId);
    this.searchErrorMessage.set("");
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.passwordsMismatch()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set("");

    try {
      const payload = toCreateUserPayload(this.form.getRawValue());
      const createdUser = await awaitOne<UserAccount>(
        this.usersService.create(payload),
      );

      await this.router.navigate(["/login"], {
        queryParams: {
          created: "1",
          email: createdUser.email,
        },
      });
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  private applyPersonMode(mode: RegistrationPersonMode): void {
    if (mode === "existing") {
      this.form.controls.existingPersonId.setValidators([Validators.required]);
      this.form.controls.firstName.clearValidators();
    } else {
      this.clearSearchDebounce();
      this.latestSearchToken += 1;
      this.isSearching.set(false);
      this.form.controls.existingPersonId.clearValidators();
      this.form.controls.firstName.setValidators([Validators.required]);
      this.hasSearched.set(false);
      this.searchErrorMessage.set("");
      this.searchResults.set([]);
      this.form.controls.searchQuery.setValue("", { emitEvent: false });
      this.form.controls.existingPersonId.setValue("", { emitEvent: false });
    }

    this.form.controls.existingPersonId.updateValueAndValidity({ emitEvent: false });
    this.form.controls.firstName.updateValueAndValidity({ emitEvent: false });
  }

  private async fetchSearchResults(query: string, searchToken: number): Promise<void> {
    try {
      const results = await awaitOne<RegistrationPersonCandidate[]>(
        this.usersService.searchRegistrationCandidates(query),
      );

      if (searchToken !== this.latestSearchToken) {
        return;
      }

      this.searchResults.set(results);
    } catch (error) {
      if (searchToken !== this.latestSearchToken) {
        return;
      }

      this.searchResults.set([]);
      this.searchErrorMessage.set(readSearchError(error));
    } finally {
      if (searchToken === this.latestSearchToken) {
        this.isSearching.set(false);
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

function toCreateUserPayload(value: {
  email: string;
  password: string;
  confirmPassword: string;
  personMode: RegistrationPersonMode;
  searchQuery: string | RegistrationPersonCandidate;
  existingPersonId: string;
  firstName: string;
  lastName: string;
  middleName: string;
  maidenName: string;
  gender: Person["gender"];
  birthDate: string;
  birthPlace: string;
  isLiving: LivingOption;
}): CreateUserDto {
  if (value.personMode === "existing") {
    return {
      email: value.email.trim(),
      password: value.password,
      personMode: "existing",
      existingPersonId: value.existingPersonId,
    };
  }

  return {
    email: value.email.trim(),
    password: value.password,
    personMode: "new",
    person: {
      firstName: value.firstName,
      lastName: emptyToNull(value.lastName),
      middleName: emptyToNull(value.middleName),
      maidenName: emptyToNull(value.maidenName),
      gender: value.gender,
      birthDate: emptyToNull(value.birthDate),
      birthPlace: emptyToNull(value.birthPlace),
      isLiving: value.isLiving === "unknown" ? null : value.isLiving === "true",
    },
  };
}

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Не вдалося створити користувача";
  }

  return "Не вдалося створити користувача";
}

function readSearchError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Не вдалося виконати пошук";
  }

  return "Не вдалося виконати пошук";
}
