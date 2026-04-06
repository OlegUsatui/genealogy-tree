import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { AuthService } from "../services/auth.service";

export const loginGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.restoreSession();

  if (authService.user()) {
    return router.createUrlTree(["/persons"]);
  }

  return true;
};

