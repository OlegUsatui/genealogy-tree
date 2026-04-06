import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";

import { AuthService } from "../services/auth.service";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="app-page login-page">
      <div class="login-card card">
        <div class="login-copy">
          <span class="chip">MVP</span>
          <h1>Вхід до Family Tree</h1>
          <p>
            Простий приватний інструмент для ведення сімейного дерева. Для локального старту
            використовуйте seed-користувача.
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="login-form">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" formControlName="email">
          </div>

          <div class="field">
            <label for="password">Пароль</label>
            <input id="password" type="password" formControlName="password">
          </div>

          <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

          <button class="btn btn-primary" type="submit" [disabled]="form.invalid || isSubmitting()">
            {{ isSubmitting() ? "Вхід..." : "Увійти" }}
          </button>

          <div class="seed-hint">
            <strong>Seed login:</strong>
            <span><code>admin&#64;example.com</code> / <code>admin12345</code></span>
          </div>
        </form>
      </div>
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

      .login-copy h1 {
        margin: 14px 0 10px;
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
        background: rgba(255, 255, 255, 0.65);
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: 22px;
      }

      .seed-hint {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        border-radius: 16px;
        background: rgba(45, 34, 21, 0.06);
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
      const redirect = this.route.snapshot.queryParamMap.get("redirect") ?? "/persons";
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
