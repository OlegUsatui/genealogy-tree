import type { CreateUserDto, RegistrationPersonCandidate, UserAccount } from "@family-tree/shared";

import { Injectable, inject } from "@angular/core";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class UsersService {
  private readonly api = inject(ApiService);

  create(payload: CreateUserDto) {
    return this.api.post<UserAccount>("/users", payload);
  }

  searchRegistrationCandidates(query: string) {
    const params = new URLSearchParams({ q: query.trim() });
    return this.api.get<RegistrationPersonCandidate[]>(`/signup/persons?${params.toString()}`);
  }
}
