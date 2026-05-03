import type { CreateUserDto, Person, RegistrationPersonCandidate, UserAccount } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { formatPersonDisplayName } from "../lib/person-name";
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
            <h1>Створення акаунту</h1>
            <p class="muted">
              Заповніть свої дані. Якщо ми знайдемо ваш профіль у сімейному дереві, ви зможете просто
              обрати його, відредагувати дані за потреби і завершити реєстрацію без дубля.
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
              <h2>Ваш профіль у дереві</h2>
              <p class="muted">
                Почніть вводити свої ім’я, прізвище і дату народження. Якщо така людина вже є в базі,
                ми запропонуємо її тут же, без окремого пошуку.
              </p>
            </div>

            <div class="selected-match" *ngIf="selectedExistingCandidate() as selected">
              <div class="selected-match-copy">
                <span class="selected-match-eyebrow">Ви реєструєтесь як наявна людина</span>
                <strong>{{ candidateHeadline(selected) }}</strong>
                <span class="muted">
                  Дані нижче вже підтягнуті з дерева. Ви можете підправити їх перед збереженням.
                </span>
              </div>

              <button mat-stroked-button type="button" (click)="clearExistingSelection()">
                Це не я
              </button>
            </div>

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

            <p class="muted helper-text">
              Дата народження обов’язкова: вона потрібна, щоб не створювати дублікати.
            </p>

            <div class="match-panel" *ngIf="showMatchPanel()">
              <div class="match-panel-copy">
                <h3>{{ matchPanelTitle() }}</h3>
                <p class="muted">{{ matchPanelDescription() }}</p>
              </div>

              <mat-progress-bar *ngIf="isSearching()" mode="indeterminate"></mat-progress-bar>

              <p class="error-text" *ngIf="searchErrorMessage()">{{ searchErrorMessage() }}</p>

              <div class="match-options" *ngIf="suggestedMatches().length > 0">
                <button
                  *ngFor="let candidate of suggestedMatches()"
                  type="button"
                  class="match-option"
                  [class.match-option--exact]="isExactIdentityMatch(candidate)"
                  (click)="selectCandidate(candidate)"
                >
                  <div class="match-option-copy">
                    <div class="match-option-title-row">
                      <span class="match-option-title">{{ candidateHeadline(candidate) }}</span>
                      <span class="match-badge" *ngIf="isExactIdentityMatch(candidate)">Точний збіг</span>
                    </div>
                    <span class="match-option-meta">{{ candidateDetails(candidate) }}</span>
                  </div>
                  <span class="match-option-action">Використати</span>
                </button>
              </div>

              <p class="muted helper-text" *ngIf="showNoMatchesMessage()">
                Поки що збігів не видно. Якщо це нова людина, просто завершіть реєстрацію і ми створимо
                для вас новий профіль.
              </p>
            </div>
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
              {{ submitLabel() }}
            </button>
          </div>
        </form>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .user-form-shell {
        padding: clamp(18px, 2.4vw, 24px);
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

      .section-copy h2,
      .match-panel-copy h3 {
        margin: 0 0 6px;
      }

      .section-copy p,
      .match-panel-copy p {
        margin: 0;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .helper-text {
        margin: 0;
      }

      .selected-match {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 18px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(225, 244, 240, 0.85), rgba(237, 247, 244, 0.94));
        border: 1px solid rgba(93, 131, 120, 0.22);
      }

      .selected-match-copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .selected-match-eyebrow {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #3c6b5f;
      }

      .match-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px;
        border-radius: 18px;
        background: rgba(247, 251, 250, 0.94);
        border: 1px solid rgba(96, 114, 123, 0.14);
      }

      .match-options {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .match-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: 100%;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(96, 114, 123, 0.16);
        background: #fff;
        text-align: left;
        cursor: pointer;
        transition:
          transform 120ms ease,
          border-color 120ms ease,
          box-shadow 120ms ease;
      }

      .match-option:hover {
        transform: translateY(-1px);
        border-color: rgba(53, 95, 83, 0.32);
        box-shadow: 0 14px 24px rgba(31, 43, 41, 0.08);
      }

      .match-option--exact {
        border-color: rgba(53, 95, 83, 0.36);
        background: linear-gradient(180deg, rgba(234, 247, 243, 0.96), rgba(250, 252, 251, 0.98));
      }

      .match-option-copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .match-option-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .match-option-title {
        font-weight: 700;
        color: var(--text);
      }

      .match-option-meta {
        font-size: 13px;
        color: var(--muted-foreground);
      }

      .match-option-action {
        font-size: 13px;
        font-weight: 700;
        color: #335e53;
        white-space: nowrap;
      }

      .match-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(63, 112, 99, 0.12);
        color: #355f53;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .form-actions {
        display: flex;
        justify-content: flex-start;
      }

      @media (max-width: 900px) {
        .form-header,
        .selected-match {
          flex-direction: column;
          align-items: stretch;
        }
      }

      @media (max-width: 760px) {
        .field-grid {
          grid-template-columns: 1fr;
        }

        .match-option {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      @media (max-width: 640px) {
        .form-header h1 {
          font-size: 30px;
        }

        .header-actions,
        .form-actions {
          width: 100%;
        }

        .header-actions > .mat-mdc-button-base,
        .form-actions > .mat-mdc-button-base,
        .selected-match > .mat-mdc-button-base {
          width: 100%;
          justify-content: center;
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
  readonly selectedExistingCandidate = signal<RegistrationPersonCandidate | null>(null);

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
    existingPersonId: new FormControl("", { nonNullable: true }),
    firstName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    lastName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    middleName: new FormControl("", { nonNullable: true }),
    maidenName: new FormControl("", { nonNullable: true }),
    gender: new FormControl<Person["gender"]>("unknown", { nonNullable: true }),
    birthDate: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    birthPlace: new FormControl("", { nonNullable: true }),
    isLiving: new FormControl<LivingOption>("true", { nonNullable: true }),
  });

  constructor() {
    this.form.controls.firstName.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onIdentityFieldsChanged();
    });

    this.form.controls.middleName.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onIdentityFieldsChanged();
    });

    this.form.controls.lastName.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onIdentityFieldsChanged();
    });

    this.form.controls.birthDate.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onIdentityFieldsChanged();
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

  submitLabel(): string {
    return this.isSaving()
      ? "Створення..."
      : this.selectedExistingCandidate()
        ? "Зареєструватися з наявним профілем"
        : "Створити акаунт";
  }

  candidateHeadline(candidate: RegistrationPersonCandidate): string {
    return formatPersonDisplayName(candidate, { order: "surname-first" });
  }

  candidateDetails(candidate: RegistrationPersonCandidate): string {
    const details = [candidate.birthDate, candidate.birthPlace].filter(Boolean);
    return details.length > 0 ? details.join(" • ") : "Дата та місто народження не вказані";
  }

  showMatchPanel(): boolean {
    return (
      !this.selectedExistingCandidate() &&
      (this.isSearching() ||
        this.searchErrorMessage().length > 0 ||
        this.suggestedMatches().length > 0 ||
        this.showNoMatchesMessage())
    );
  }

  showNoMatchesMessage(): boolean {
    return this.hasSearched() && !this.isSearching() && this.searchResults().length === 0;
  }

  suggestedMatches(): RegistrationPersonCandidate[] {
    const exact: RegistrationPersonCandidate[] = [];
    const similar: RegistrationPersonCandidate[] = [];

    for (const candidate of this.searchResults()) {
      if (this.isExactIdentityMatch(candidate)) {
        exact.push(candidate);
      } else {
        similar.push(candidate);
      }
    }

    return [...exact, ...similar];
  }

  matchPanelTitle(): string {
    if (this.hasExactMatches()) {
      return "Схоже, ви вже є в цьому дереві";
    }

    return "Можливо, це вже ваш профіль";
  }

  matchPanelDescription(): string {
    if (this.hasExactMatches()) {
      return "Натисніть на свій профіль, і ми прив’яжемо акаунт до нього без створення дубля.";
    }

    return "Якщо бачите себе в списку, просто виберіть профіль. Якщо ні, продовжуйте реєстрацію як нова людина.";
  }

  isExactIdentityMatch(candidate: RegistrationPersonCandidate): boolean {
    const birthDate = this.form.controls.birthDate.value.trim();

    if (!birthDate || !candidate.birthDate) {
      return false;
    }

    return (
      normalizeIdentityValue(candidate.firstName) === normalizeIdentityValue(this.form.controls.firstName.value) &&
      normalizeIdentityValue(candidate.lastName) === normalizeIdentityValue(this.form.controls.lastName.value) &&
      candidate.birthDate === birthDate
    );
  }

  selectCandidate(candidate: RegistrationPersonCandidate): void {
    this.selectedExistingCandidate.set(candidate);
    this.form.controls.existingPersonId.setValue(candidate.sourcePersonId, { emitEvent: false });
    this.form.patchValue(
      {
        firstName: candidate.firstName,
        lastName: candidate.lastName ?? "",
        middleName: candidate.middleName ?? "",
        maidenName: candidate.maidenName ?? "",
        gender: candidate.gender,
        birthDate: candidate.birthDate ?? "",
        birthPlace: candidate.birthPlace ?? "",
        isLiving: candidate.isLiving === null ? "unknown" : candidate.isLiving ? "true" : "false",
      },
      { emitEvent: false },
    );
    this.hasSearched.set(false);
    this.isSearching.set(false);
    this.searchResults.set([]);
    this.searchErrorMessage.set("");
    this.errorMessage.set("");
  }

  clearExistingSelection(): void {
    this.selectedExistingCandidate.set(null);
    this.form.controls.existingPersonId.setValue("", { emitEvent: false });
    this.errorMessage.set("");
    this.scheduleSearch();
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.passwordsMismatch()) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.selectedExistingCandidate() && this.hasExactMatches()) {
      this.errorMessage.set("Ми вже знайшли такий профіль у дереві. Оберіть його зі списку, щоб не створити дубль.");
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set("");

    try {
      const payload = toCreateUserPayload(this.form.getRawValue());
      await awaitOne<UserAccount>(this.usersService.create(payload));

      await this.router.navigate(["/login"], {
        queryParams: {
          created: "1",
        },
      });
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  private onIdentityFieldsChanged(): void {
    this.errorMessage.set("");

    if (this.selectedExistingCandidate()) {
      return;
    }

    this.form.controls.existingPersonId.setValue("", { emitEvent: false });
    this.scheduleSearch();
  }

  private hasExactMatches(): boolean {
    return this.searchResults().some((candidate) => this.isExactIdentityMatch(candidate));
  }

  private scheduleSearch(): void {
    this.clearSearchDebounce();
    this.latestSearchToken += 1;
    this.searchErrorMessage.set("");

    const query = buildRegistrationQuery(
      this.form.controls.firstName.value,
      this.form.controls.middleName.value,
      this.form.controls.lastName.value,
    );

    if (!query) {
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
  }

  private async fetchSearchResults(query: string, searchToken: number): Promise<void> {
    try {
      const results = await awaitOne<RegistrationPersonCandidate[]>(this.usersService.searchRegistrationCandidates(query));

      if (searchToken !== this.latestSearchToken || this.selectedExistingCandidate()) {
        return;
      }

      this.searchResults.set(results);
    } catch (error) {
      if (searchToken !== this.latestSearchToken || this.selectedExistingCandidate()) {
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
  return {
    email: value.email.trim(),
    password: value.password,
    personMode: value.existingPersonId ? "existing" : "new",
    existingPersonId: emptyToNull(value.existingPersonId),
    person: {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      middleName: emptyToNull(value.middleName),
      maidenName: emptyToNull(value.maidenName),
      gender: value.gender,
      birthDate: value.birthDate.trim(),
      birthPlace: emptyToNull(value.birthPlace),
      isLiving: value.isLiving === "unknown" ? null : value.isLiving === "true",
    },
  };
}

function buildRegistrationQuery(firstName: string, middleName: string, lastName: string): string | null {
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const normalizedMiddleName = middleName.trim();
  const nameParts = [normalizedLastName, normalizedMiddleName, normalizedFirstName].filter(Boolean);

  if (normalizedFirstName.length < 2 || nameParts.length < 2) {
    return null;
  }

  return nameParts.join(" ");
}

function normalizeIdentityValue(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("uk-UA") ?? "";
}

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.error?.code === "person_duplicate") {
      return "Такий профіль уже є в дереві. Оберіть його зі списку вище, щоб зареєструватися без дубля.";
    }

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
