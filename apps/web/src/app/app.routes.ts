import { Routes } from "@angular/router";

import { authGuard } from "./guards/auth.guard";
import { loginGuard } from "./guards/login.guard";
import { LoginPageComponent } from "./pages/login.page";
import { PersonDetailsPageComponent } from "./pages/person-details.page";
import { PersonFormPageComponent } from "./pages/person-form.page";
import { PersonsListPageComponent } from "./pages/persons-list.page";
import { TreePageComponent } from "./pages/tree.page";

export const routes: Routes = [
  {
    path: "",
    component: TreePageComponent,
    canActivate: [authGuard],
  },
  {
    path: "login",
    component: LoginPageComponent,
    canActivate: [loginGuard],
  },
  {
    path: "persons",
    component: PersonsListPageComponent,
    canActivate: [authGuard],
  },
  {
    path: "persons/new",
    component: PersonFormPageComponent,
    canActivate: [authGuard],
  },
  {
    path: "persons/:id/edit",
    component: PersonFormPageComponent,
    canActivate: [authGuard],
  },
  {
    path: "persons/:id",
    component: PersonDetailsPageComponent,
    canActivate: [authGuard],
  },
  {
    path: "tree/:personId",
    component: TreePageComponent,
    canActivate: [authGuard],
  },
  {
    path: "tree",
    component: TreePageComponent,
    canActivate: [authGuard],
  },
];
