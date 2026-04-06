import type { Person } from "@family-tree/shared";

import { Injectable, inject } from "@angular/core";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class SearchService {
  private readonly api = inject(ApiService);

  search(query: string) {
    return this.api.get<Person[]>("/search", { q: query });
  }
}
