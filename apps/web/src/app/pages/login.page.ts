import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { AuthService } from "../services/auth.service";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page login-page">
      <mat-card class="login-card">
        <div class="login-copy">
          <mat-chip-set>
            <mat-chip>MVP</mat-chip>
          </mat-chip-set>
          <h1>Вхід до родинного дерева</h1>
          <p>
            Простий приватний інструмент для ведення сімейного дерева. Для локального старту
            використовуйте тестового користувача.
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
          <mat-form-field appearance="outline">
            <mat-label>Електронна пошта</mat-label>
            <input matInput id="email" type="email" formControlName="email">
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Пароль</mat-label>
            <input matInput id="password" type="password" formControlName="password">
          </mat-form-field>

          <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

          <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || isSubmitting()">
            {{ isSubmitting() ? "Вхід..." : "Увійти" }}
          </button>

          <mat-card class="seed-hint" appearance="outlined">
            <strong>Тестовий вхід:</strong>
            <span><code>admin&#64;example.com</code> / <code>admin12345</code></span>
          </mat-card>
        </form>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .login-page {
        display: grid;
        place-items: center;
        min-height: calc(100vh - 88px);
      }

      .login-card {
        display: grid;
        grid-template-columns: minmax(260px, 1.1fr) minmax(280px, 0.9fr);
        gap: 24px;
        width: min(900px, 100%);
        padding: 28px;
      }

      .login-copy mat-chip-set {
        margin-bottom: 6px;
      }

      .login-copy h1 {
        margin: 0 0 10px;
        font-size: clamp(34px, 4vw, 52px);
        line-height: 0.96;
      }

      .login-copy p {
        max-width: 44ch;
        color: var(--muted);
      }

      .login-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        border-radius: 22px;
      }

      .seed-hint {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        color: var(--muted);
      }

      @media (max-width: 860px) {
        .login-card {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal("");

  readonly form = new FormGroup({
    email: new FormControl("admin@example.com", {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl("admin12345", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set("");

    try {
      await this.authService.login(this.form.getRawValue());
      const redirect = this.route.snapshot.queryParamMap.get("redirect") ?? "/";
      await this.router.navigateByUrl(redirect);
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Не вдалося виконати вхід";
  }

  return "Не вдалося виконати вхід";
}
