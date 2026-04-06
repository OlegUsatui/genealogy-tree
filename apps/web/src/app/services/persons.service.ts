import type { CreatePersonDto, Person, UpdatePersonDto } from "@family-tree/shared";

import { Injectable, inject } from "@angular/core";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class PersonsService {
  private readonly api = inject(ApiService);

  list() {
    return this.api.get<Person[]>("/persons");
  }

  get(personId: string) {
    return this.api.get<Person>(`/persons/${personId}`);
  }

  getDirectoryPerson(personId: string) {
    return this.api.get<Person>(`/directory/persons/${personId}`);
  }

  importDirectoryPerson(personId: string) {
    return this.api.post<Person>(`/directory/persons/${personId}/import`, {});
  }

  create(payload: CreatePersonDto) {
    return this.api.post<Person>("/persons", payload);
  }

  update(personId: string, payload: UpdatePersonDto) {
    return this.api.patch<Person>(`/persons/${personId}`, payload);
  }

  delete(personId: string) {
    return this.api.delete<void>(`/persons/${personId}`);
  }
}
