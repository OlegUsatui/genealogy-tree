import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";

import { MATERIAL_IMPORTS } from "../material";
import { AuthService } from "../services/auth.service";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page login-page">
      <mat-card class="login-card">
        <div class="login-copy">
          <h1>Вхід до родинного дерева</h1>
          <p>
            Керуйте родинними профілями, зв’язками та деревом в одному місці.
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

          <a mat-stroked-button color="primary" routerLink="/users/new" class="signup-link">
            Створити нового користувача
          </a>
        </form>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .login-page {
        display: grid;
        place-items: center;
        min-height: calc(100dvh - 124px);
      }

      .login-card {
        display: grid;
        grid-template-columns: minmax(260px, 1.1fr) minmax(280px, 0.9fr);
        gap: clamp(18px, 2vw, 24px);
        width: min(900px, 100%);
        padding: clamp(18px, 3vw, 28px);
      }

      .login-copy h1 {
        margin: 0 0 10px;
        font-size: clamp(34px, 4vw, 52px);
        line-height: 0.96;
      }

      .login-copy p {
        max-width: 44ch;
        color: var(--muted-foreground);
      }

      .login-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        border-radius: 22px;
      }

      .signup-link {
        text-decoration: none;
      }

      @media (max-width: 860px) {
        .login-card {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .login-page {
          min-height: auto;
          align-items: start;
        }

        .login-card {
          width: 100%;
        }

        .login-copy h1 {
          font-size: 30px;
        }

        .login-form > .mat-mdc-button-base {
          width: 100%;
          justify-content: center;
        }
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal("");

  readonly form = new FormGroup({
    email: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  constructor() {
    const created = this.route.snapshot.queryParamMap.get("created");
    const accountDeleted = this.route.snapshot.queryParamMap.get("accountDeleted");

    if (created === "1") {
      this.snackBar.open("Користувача створено. Тепер він може увійти в систему.", "Закрити", {
        duration: 5000,
        horizontalPosition: "right",
        verticalPosition: "top",
      });

      queueMicrotask(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {
            created: null,
          },
          queryParamsHandling: "merge",
          replaceUrl: true,
        });
      });
    }

    if (accountDeleted === "1") {
      this.snackBar.open("Акаунт видалено.", "Закрити", {
        duration: 5000,
        horizontalPosition: "right",
        verticalPosition: "top",
      });

      queueMicrotask(() => {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {
            accountDeleted: null,
          },
          queryParamsHandling: "merge",
          replaceUrl: true,
        });
      });
    }
  }

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
