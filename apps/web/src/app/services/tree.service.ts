import type { TreeResponse } from "@family-tree/shared";

import { Injectable, inject } from "@angular/core";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class TreeService {
  private readonly api = inject(ApiService);

  getTree(personId: string, up: number | "all", down: number | "all") {
    return this.api.get<TreeResponse>(`/tree/${personId}`, {
      up,
      down,
    });
  }
}
