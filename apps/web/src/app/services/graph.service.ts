import type { FamilyGraphResponse } from "@family-tree/shared";

import { Injectable, inject } from "@angular/core";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class GraphService {
  private readonly api = inject(ApiService);

  getGraph(personId: string) {
    return this.api.get<FamilyGraphResponse>(`/graph/${personId}`);
  }
}
