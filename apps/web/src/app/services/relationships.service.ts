import type { CreateRelationshipDto, Relationship } from "@family-tree/shared";

import { Injectable, inject } from "@angular/core";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class RelationshipsService {
  private readonly api = inject(ApiService);

  list(personId: string) {
    return this.api.get<Relationship[]>("/relationships", { personId });
  }

  create(payload: CreateRelationshipDto) {
    return this.api.post<Relationship>("/relationships", payload);
  }

  delete(relationshipId: string) {
    return this.api.delete<void>(`/relationships/${relationshipId}`);
  }
}
