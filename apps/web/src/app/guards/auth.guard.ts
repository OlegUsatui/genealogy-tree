import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { AuthService } from "../services/auth.service";

export const authGuard: CanActivateFn = async (_, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.restoreSession();

  if (authService.user()) {
    return true;
  }

  return router.createUrlTree(["/login"], {
    queryParams: {
      redirect: state.url,
    },
  });
};

