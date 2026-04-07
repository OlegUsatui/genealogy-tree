import type { CreatePersonDto, CreateRelationshipDto, DuplicatePersonCheckResponse, Person, Relationship } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";

import { PhotoCropDialogComponent } from "../components/photo-crop-dialog.component";
import { buildPhotoInitials, isSupportedPhotoUrl, optimizePhotoFile, validatePhotoFile } from "../lib/photo";
import { MATERIAL_IMPORTS } from "../material";
import { AuthService } from "../services/auth.service";
import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";
import { RelationshipsService } from "../services/relationships.service";

type LivingOption = "unknown" | "true" | "false";
type NewRelativeGroup = "parents" | "children" | "spouses";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PhotoCropDialogComponent, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page">
      <mat-card class="form-shell">
        <div class="form-header">
          <div>
            <h1>{{ formTitle() }}</h1>
            <p class="muted">{{ formIntro() }}</p>
          </div>

          <button mat-stroked-button color="primary" type="button" class="form-link" (click)="navigateBackFromForm()">
            {{ backButtonLabel() }}
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="form-grid">
          <mat-card appearance="outlined" class="section-card relation-context-card" *ngIf="relationContextPerson() as relationPerson">
            <div class="section-copy">
              <h2>{{ relationContextHeading(relationPerson) }}</h2>
              <p class="muted">{{ relationContextDescription(relationPerson) }}</p>
            </div>
          </mat-card>

          <mat-card appearance="outlined" class="section-card">
            <div class="section-copy">
              <h2>Основне</h2>
              <p class="muted">
                Спочатку внесіть ключові дані, за якими людину можна впізнати. Якщо такий профіль уже є, покажемо це
                ще до збереження.
              </p>
            </div>

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
                <mat-label>Дата народження</mat-label>
                <input matInput id="birthDate" type="date" formControlName="birthDate">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Місце народження</mat-label>
                <input matInput id="birthPlace" formControlName="birthPlace">
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
            </div>

            <mat-progress-bar *ngIf="isCheckingDuplicate()" mode="indeterminate"></mat-progress-bar>

            <div class="duplicate-preview-notice" *ngIf="liveDuplicateLink() as liveDuplicateLink">
              <p class="duplicate-preview-title">Схоже, така людина вже є в базі.</p>
              <p class="muted">
                Профіль з таким ім’ям, прізвищем і датою народження вже існує. Краще відкрити його, а не створювати
                дубль.
              </p>
              <a mat-stroked-button color="primary" [routerLink]="['/persons', liveDuplicateLink.personId]">
                Відкрити профіль {{ liveDuplicateLink.personName || "людини" }}
              </a>
            </div>
          </mat-card>

          <section class="optional-section">
            <button type="button" class="optional-toggle" (click)="toggleAdditionalDetails()">
              <div class="section-copy">
                <h2>Додатково</h2>
                <p class="muted">Фото, біографія та другорядні поля. Це можна заповнити й пізніше.</p>
              </div>

              <span class="optional-toggle-copy">
                {{ isAdditionalDetailsOpen() ? "Сховати" : "Показати" }}
              </span>
            </button>

            <div class="optional-body" *ngIf="isAdditionalDetailsOpen()">
              <mat-form-field appearance="outline">
                <mat-label>Дівоче прізвище</mat-label>
                <input matInput id="maidenName" formControlName="maidenName">
              </mat-form-field>

              <section class="photo-section">
                <div class="photo-preview-shell">
                  <img *ngIf="photoPreviewUrl(); else photoFallback" [src]="photoPreviewUrl()!" alt="Фото профілю" class="photo-preview">
                  <ng-template #photoFallback>
                    <div class="photo-fallback">{{ photoInitials() }}</div>
                  </ng-template>
                </div>

                <div class="photo-copy">
                  <div>
                    <h2>Фотографія</h2>
                    <p class="muted">Оберіть фото людини. Перед збереженням ми автоматично стиснемо файл.</p>
                  </div>

                  <div class="photo-actions">
                    <label class="photo-upload-button">
                      <input type="file" accept="image/*" class="photo-input" (change)="onPhotoSelected($event)">
                      <span>{{ isProcessingPhoto() ? "Обробка..." : "Завантажити фото" }}</span>
                    </label>
                    <button
                      *ngIf="form.controls.photoUrl.value"
                      mat-button
                      type="button"
                      [disabled]="isProcessingPhoto()"
                      (click)="removePhoto()"
                    >
                      Прибрати фото
                    </button>
                  </div>

                  <p class="error-text" *ngIf="photoErrorMessage()">{{ photoErrorMessage() }}</p>
                </div>
              </section>

              <mat-form-field appearance="outline">
                <mat-label>Біографія</mat-label>
                <textarea matInput id="biography" formControlName="biography"></textarea>
              </mat-form-field>
            </div>
          </section>

          <div class="duplicate-person-notice" *ngIf="duplicatePersonLink() as duplicatePersonLink; else simpleErrorMessage">
            <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>
            <a mat-stroked-button color="primary" [routerLink]="['/persons', duplicatePersonLink.personId]">
              Перейти до профілю {{ duplicatePersonLink.personName || "людини" }}
            </a>
          </div>

          <ng-template #simpleErrorMessage>
            <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>
          </ng-template>

          <div class="form-actions">
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="form.invalid || isSaving() || isDeletingAccount() || hasBlockingDuplicate()"
            >
              {{ submitButtonLabel() }}
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

    <app-photo-crop-dialog
      *ngIf="cropSourceFile() as cropFile"
      [file]="cropFile"
      (cancelCrop)="closePhotoCrop()"
      (saveCrop)="applyCroppedPhoto($event)"
    ></app-photo-crop-dialog>
  `,
  styles: [
    `
      .form-shell {
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
        border-radius: 24px;
        border: 1px solid rgba(127, 160, 200, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.18), transparent 42%);
      }

      .section-copy h2,
      .section-copy p {
        margin: 0;
      }

      .section-copy {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field-stack {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .optional-section {
        border-radius: 24px;
        border: 1px solid rgba(127, 160, 200, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.18), transparent 42%);
      }

      .optional-toggle {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px;
        border: 0;
        background: transparent;
        text-align: left;
        cursor: pointer;
        color: inherit;
      }

      .optional-toggle-copy {
        flex-shrink: 0;
        font-weight: 700;
        color: #234261;
      }

      .optional-body {
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 0 18px 18px;
      }

      .photo-section {
        display: grid;
        grid-template-columns: 132px minmax(0, 1fr);
        gap: 18px;
        align-items: center;
        padding: 18px;
        border-radius: 24px;
        border: 1px solid rgba(127, 160, 200, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.18), transparent 42%);
      }

      .duplicate-preview-notice {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(197, 157, 74, 0.2);
        background: rgba(255, 252, 245, 0.96);
      }

      .duplicate-preview-title {
        margin: 0;
        font-weight: 800;
        color: #5f4a17;
      }

      .photo-preview-shell {
        width: 132px;
        height: 132px;
        border-radius: 28px;
        overflow: hidden;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background: linear-gradient(180deg, rgba(233, 241, 251, 0.92), rgba(219, 233, 248, 0.92));
        box-shadow: 0 14px 30px rgba(41, 69, 103, 0.12);
      }

      .photo-preview,
      .photo-fallback {
        width: 100%;
        height: 100%;
      }

      .photo-preview {
        display: block;
        object-fit: cover;
      }

      .photo-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 34px;
        font-weight: 800;
        color: #234261;
      }

      .photo-copy {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .photo-copy h2,
      .photo-copy p {
        margin: 0;
      }

      .photo-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .photo-upload-button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid rgba(53, 90, 136, 0.26);
        background: rgba(255, 255, 255, 0.92);
        color: #17324d;
        font-weight: 700;
        cursor: pointer;
      }

      .photo-upload-button:hover {
        border-color: rgba(53, 90, 136, 0.38);
      }

      .photo-input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
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

      .duplicate-person-notice {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(196, 114, 114, 0.16);
        background: rgba(255, 249, 249, 0.94);
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

      @media (max-width: 900px) {
        .form-header {
          flex-direction: column;
        }
      }

      @media (max-width: 640px) {
        .form-header h1 {
          font-size: 30px;
        }

        .photo-section {
          grid-template-columns: 1fr;
        }

        .optional-toggle {
          flex-direction: column;
          align-items: flex-start;
        }

        .photo-preview-shell {
          width: 120px;
          height: 120px;
        }

        .form-link,
        .form-actions > .mat-mdc-button-base,
        .danger-button,
        .photo-actions > .mat-mdc-button-base,
        .photo-upload-button {
          width: 100%;
          justify-content: center;
        }

        .danger-button {
          align-self: stretch;
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
  private readonly relationshipsService = inject(RelationshipsService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  readonly personId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isDeletingAccount = signal(false);
  readonly errorMessage = signal("");
  readonly deleteAccountError = signal("");
  readonly photoPreviewUrl = signal<string | null>(null);
  readonly photoErrorMessage = signal("");
  readonly isProcessingPhoto = signal(false);
  readonly cropSourceFile = signal<File | null>(null);
  readonly duplicatePersonLink = signal<DuplicatePersonLink | null>(null);
  readonly liveDuplicateLink = signal<DuplicatePersonLink | null>(null);
  readonly isCheckingDuplicate = signal(false);
  readonly isAdditionalDetailsOpen = signal(false);
  readonly relationContextPerson = signal<Person | null>(null);
  readonly relationContextGroup = signal<NewRelativeGroup | null>(null);
  readonly returnTreePersonId = signal<string | null>(null);

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

  private duplicateCheckRequestId = 0;
  private duplicateCheckTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.duplicateCheckTimer) {
        clearTimeout(this.duplicateCheckTimer);
      }
    });

    this.form.controls.isLiving.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (value === "true") {
        this.form.controls.deathDate.setValue("", { emitEvent: false });
        this.form.controls.deathPlace.setValue("", { emitEvent: false });
      }
    });

    this.form.controls.firstName.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.scheduleDuplicateCheck();
    });

    this.form.controls.lastName.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.scheduleDuplicateCheck();
    });

    this.form.controls.birthDate.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.scheduleDuplicateCheck();
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get("id");
      this.personId.set(id);

      if (id) {
        void this.loadPerson(id);
        this.relationContextPerson.set(null);
        this.relationContextGroup.set(null);
        this.returnTreePersonId.set(null);
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
        this.photoPreviewUrl.set(null);
        this.photoErrorMessage.set("");
        this.duplicatePersonLink.set(null);
        this.liveDuplicateLink.set(null);
        this.isCheckingDuplicate.set(false);
        this.isAdditionalDetailsOpen.set(false);
      }
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (this.personId()) {
        return;
      }

      const relatedTo = params.get("relatedTo");
      const group = parseNewRelativeGroup(params.get("group"));
      const returnTreePersonId = params.get("returnTreePersonId");

      this.relationContextGroup.set(group);
      this.returnTreePersonId.set(returnTreePersonId);

      if (relatedTo && group) {
        void this.loadRelationContextPerson(relatedTo);
        return;
      }

      this.relationContextPerson.set(null);
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.hasBlockingDuplicate()) {
      this.errorMessage.set("Профіль з такими даними вже існує. Відкрийте його замість створення дубля.");
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set("");
    this.duplicatePersonLink.set(null);
    const payload = toPersonPayload(this.form.getRawValue());

    try {
      if (this.personId()) {
        const person = await awaitOne<Person>(this.personsService.update(this.personId()!, payload));
        await this.router.navigate(["/persons", person.id]);
      } else {
        const person = await awaitOne<Person>(this.personsService.create(payload));
        if (this.relationContextPerson() && this.relationContextGroup()) {
          await this.createContextRelationship(person);
          this.snackBar.open("Людину додано і зв’язок створено", "Закрити", { duration: 3000 });
          await this.navigateAfterContextCreate();
        } else {
          await this.router.navigate(["/persons", person.id]);
        }
      }
    } catch (error) {
      this.errorMessage.set(readApiError(error));
      this.duplicatePersonLink.set(readDuplicatePersonLink(error));
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

  formTitle(): string {
    if (this.personId()) {
      return "Редагувати людину";
    }

    const group = this.relationContextGroup();

    switch (group) {
      case "parents":
        return "Додати батька / матір";
      case "children":
        return "Додати дитину";
      case "spouses":
        return "Додати партнера / партнерку";
      default:
        return "Нова людина";
    }
  }

  formIntro(): string {
    if (this.personId()) {
      return "Оновіть дані профілю та за потреби додайте фотографію.";
    }

    if (this.relationContextPerson() && this.relationContextGroup()) {
      return "Створіть новий профіль, а зв’язок із вибраною людиною ми створимо автоматично після збереження.";
    }

    return "Заповніть дані профілю та за потреби додайте фотографію.";
  }

  backButtonLabel(): string {
    if (this.returnTreePersonId()) {
      return "Назад до дерева";
    }

    if (this.relationContextPerson()) {
      return "Назад до профілю";
    }

    return "До списку";
  }

  relationContextHeading(person: Person): string {
    switch (this.relationContextGroup()) {
      case "parents":
        return `Ви додаєте батька або матір для ${this.displayName(person)}`;
      case "children":
        return `Ви додаєте дитину для ${this.displayName(person)}`;
      case "spouses":
        return `Ви додаєте партнера або партнерку для ${this.displayName(person)}`;
      default:
        return "";
    }
  }

  relationContextDescription(person: Person): string {
    switch (this.relationContextGroup()) {
      case "parents":
        return `Після збереження нова людина автоматично стане одним із батьків для ${this.displayName(person)}.`;
      case "children":
        return `Після збереження нова людина автоматично стане дитиною для ${this.displayName(person)}.`;
      case "spouses":
        return `Після збереження нова людина автоматично буде пов’язана з ${this.displayName(person)} як партнер або партнерка.`;
      default:
        return "";
    }
  }

  photoInitials(): string {
    return buildPhotoInitials(this.form.controls.firstName.value, this.form.controls.lastName.value);
  }

  displayName(person: Person): string {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
  }

  async navigateBackFromForm(): Promise<void> {
    if (this.returnTreePersonId()) {
      await this.router.navigate(["/tree", this.returnTreePersonId()]);
      return;
    }

    const relationPerson = this.relationContextPerson();

    if (relationPerson) {
      await this.router.navigate(["/persons", relationPerson.id]);
      return;
    }

    await this.router.navigate(["/persons"]);
  }

  toggleAdditionalDetails(): void {
    this.isAdditionalDetailsOpen.update((value) => !value);
  }

  hasBlockingDuplicate(): boolean {
    return this.liveDuplicateLink() !== null;
  }

  submitButtonLabel(): string {
    if (this.isSaving()) {
      return this.personId() ? "Збереження..." : "Створення...";
    }

    return this.personId() ? "Зберегти зміни" : "Створити людину";
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target;

    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    this.photoErrorMessage.set("");

    try {
      validatePhotoFile(file);
      this.isAdditionalDetailsOpen.set(true);
      this.cropSourceFile.set(file);
    } catch (error) {
      this.photoErrorMessage.set(readUploadError(error));
    }
  }

  removePhoto(): void {
    this.form.controls.photoUrl.setValue("");
    this.photoPreviewUrl.set(null);
    this.photoErrorMessage.set("");
  }

  closePhotoCrop(): void {
    this.cropSourceFile.set(null);
  }

  async applyCroppedPhoto(file: File): Promise<void> {
    this.cropSourceFile.set(null);
    this.photoErrorMessage.set("");
    this.isProcessingPhoto.set(true);

    try {
      const photoUrl = await optimizePhotoFile(file);
      this.form.controls.photoUrl.setValue(photoUrl);
      this.photoPreviewUrl.set(photoUrl);
    } catch (error) {
      this.photoErrorMessage.set(readUploadError(error));
    } finally {
      this.isProcessingPhoto.set(false);
    }
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
      this.photoPreviewUrl.set(isSupportedPhotoUrl(person.photoUrl) ? person.photoUrl : null);
      this.photoErrorMessage.set("");
      this.duplicatePersonLink.set(null);
      this.liveDuplicateLink.set(null);
      this.isCheckingDuplicate.set(false);
      this.isAdditionalDetailsOpen.set(hasAdditionalDetails(person));
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }

  private async loadRelationContextPerson(personId: string): Promise<void> {
    try {
      const person = await awaitOne<Person>(this.personsService.get(personId));
      this.relationContextPerson.set(person);
    } catch {
      this.relationContextPerson.set(null);
    }
  }

  private async createContextRelationship(createdPerson: Person): Promise<void> {
    const relationPerson = this.relationContextPerson();
    const group = this.relationContextGroup();

    if (!relationPerson || !group) {
      return;
    }

    await awaitOne<Relationship>(
      this.relationshipsService.create(buildRelationshipPayloadForNewRelative(relationPerson.id, createdPerson.id, group)),
    );
  }

  private async navigateAfterContextCreate(): Promise<void> {
    if (this.returnTreePersonId()) {
      await this.router.navigate(["/tree", this.returnTreePersonId()]);
      return;
    }

    const relationPerson = this.relationContextPerson();

    if (relationPerson) {
      await this.router.navigate(["/persons", relationPerson.id]);
      return;
    }
  }

  private async checkDuplicateCandidate(): Promise<void> {
    const firstName = this.form.controls.firstName.value.trim();
    const lastName = this.form.controls.lastName.value.trim();
    const birthDate = this.form.controls.birthDate.value.trim();

    if (!firstName || !lastName || !birthDate) {
      this.liveDuplicateLink.set(null);
      this.isCheckingDuplicate.set(false);
      return;
    }

    const requestId = ++this.duplicateCheckRequestId;
    this.isCheckingDuplicate.set(true);

    try {
      const response = await awaitOne<DuplicatePersonCheckResponse>(
        this.personsService.checkDuplicate({
          firstName,
          lastName,
          birthDate,
          ignorePersonId: this.personId() ?? undefined,
        }),
      );

      if (this.duplicateCheckRequestId === requestId) {
        this.liveDuplicateLink.set(response.duplicate);
      }
    } catch {
      if (this.duplicateCheckRequestId === requestId) {
        this.liveDuplicateLink.set(null);
      }
    } finally {
      if (this.duplicateCheckRequestId === requestId) {
        this.isCheckingDuplicate.set(false);
      }
    }
  }

  private scheduleDuplicateCheck(): void {
    if (this.duplicateCheckTimer) {
      clearTimeout(this.duplicateCheckTimer);
    }

    this.duplicateCheckTimer = setTimeout(() => {
      void this.checkDuplicateCandidate();
    }, 300);
  }
}

interface DuplicatePersonLink {
  personId: string;
  personName: string | null;
}

function parseNewRelativeGroup(value: string | null): NewRelativeGroup | null {
  switch (value) {
    case "parents":
    case "children":
    case "spouses":
      return value;
    default:
      return null;
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

function readDuplicatePersonLink(error: unknown): DuplicatePersonLink | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const details = error.error?.details;

  if (details?.code !== "person_duplicate" || typeof details.personId !== "string") {
    return null;
  }

  return {
    personId: details.personId,
    personName: typeof details.personName === "string" ? details.personName : null,
  };
}

function readUploadError(error: unknown): string {
  return error instanceof Error ? error.message : "Не вдалося обробити фото";
}

function hasAdditionalDetails(person: Person): boolean {
  return Boolean(person.maidenName || person.biography || person.photoUrl);
}

function buildRelationshipPayloadForNewRelative(
  relatedToPersonId: string,
  createdPersonId: string,
  group: NewRelativeGroup,
): CreateRelationshipDto {
  switch (group) {
    case "parents":
      return {
        type: "parent_child",
        person1Id: createdPersonId,
        person2Id: relatedToPersonId,
        startDate: null,
        endDate: null,
        notes: null,
      };
    case "children":
      return {
        type: "parent_child",
        person1Id: relatedToPersonId,
        person2Id: createdPersonId,
        startDate: null,
        endDate: null,
        notes: null,
      };
    case "spouses":
      return {
        type: "spouse",
        person1Id: relatedToPersonId,
        person2Id: createdPersonId,
        startDate: null,
        endDate: null,
        notes: null,
      };
  }
}
