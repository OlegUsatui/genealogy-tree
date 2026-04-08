import type {
  FamilyShareLinkResponse,
  PublicFamilyTreeResponse,
  PublicSelfAddDto,
  PublicSelfAddResponse,
} from "@family-tree/shared";

import { Injectable, inject } from "@angular/core";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class FamilySpacesService {
  private readonly api = inject(ApiService);

  createShare(rootPersonId: string, title?: string) {
    return this.api.post<FamilyShareLinkResponse>("/family-spaces", {
      rootPersonId,
      title,
    });
  }

  getPublicFamily(token: string) {
    return this.api.get<PublicFamilyTreeResponse>(`/public/f/${token}`);
  }

  addSelf(token: string, payload: PublicSelfAddDto) {
    return this.api.post<PublicSelfAddResponse>(`/public/f/${token}/self`, payload);
  }
}
