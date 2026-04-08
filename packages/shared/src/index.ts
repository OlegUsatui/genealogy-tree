export type Gender = "male" | "female" | "other" | "unknown";

export type RelationshipType = "parent_child" | "spouse";

export type RelationshipDirection = "current_is_parent" | "current_is_child";

export interface Person {
  id: string;
  sourcePersonId?: string | null;
  canEdit?: boolean;
  firstName: string;
  lastName: string | null;
  middleName: string | null;
  maidenName: string | null;
  gender: Gender;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  deathPlace: string | null;
  biography: string | null;
  isLiving: boolean | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonDto {
  firstName: string;
  lastName?: string | null;
  middleName?: string | null;
  maidenName?: string | null;
  gender?: Gender;
  birthDate?: string | null;
  deathDate?: string | null;
  birthPlace?: string | null;
  deathPlace?: string | null;
  biography?: string | null;
  isLiving?: boolean | null;
  photoUrl?: string | null;
}

export interface UpdatePersonDto extends Partial<CreatePersonDto> {}

export interface Relationship {
  id: string;
  type: RelationshipType;
  person1Id: string;
  person2Id: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateRelationshipDto {
  type: RelationshipType;
  person1Id: string;
  person2Id: string;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export interface CreateDirectoryRelationshipDto {
  type: RelationshipType;
  localPersonId: string;
  direction?: RelationshipDirection;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export interface CreateDirectoryRelationshipResponse {
  person: Person;
  relationship: Relationship;
}

export interface TreeResponse {
  rootPersonId: string;
  persons: Person[];
  relationships: Relationship[];
}

export interface LoginDto {
  email: string;
  password: string;
}

export type RegistrationPersonMode = "existing" | "new";

export interface RegistrationPersonCandidate {
  sourcePersonId: string;
  firstName: string;
  lastName: string | null;
  middleName: string | null;
  maidenName: string | null;
  gender: Gender;
  birthDate: string | null;
  birthPlace: string | null;
  isLiving: boolean | null;
}

export interface PersonSearchCandidate {
  sourcePersonId: string;
  firstName: string;
  lastName: string | null;
  middleName: string | null;
  maidenName: string | null;
  gender: Gender;
  birthDate: string | null;
  birthPlace: string | null;
  isLiving: boolean | null;
}

export interface DuplicatePersonMatch {
  personId: string;
  personName: string | null;
}

export interface DuplicatePersonCheckResponse {
  duplicate: DuplicatePersonMatch | null;
}

export interface FamilyShareLinkResponse {
  familySpaceId: string;
  title: string;
  rootPersonId: string;
  token: string;
  shareUrl: string;
}

export interface PublicFamilyTreeResponse {
  familySpaceId: string;
  title: string;
  rootPersonId: string;
  token: string;
  tree: TreeResponse;
}

export type PublicSelfRelationshipKind = "parent" | "child" | "spouse";

export interface PublicSelfAddDto {
  existingPersonId?: string | null;
  relatedToPersonId?: string | null;
  relationKind?: PublicSelfRelationshipKind | null;
  person?: CreatePersonDto | null;
}

export interface PublicSelfAddResponse {
  person: Person;
  relationship: Relationship | null;
  usedExistingPerson: boolean;
  alreadyInTree: boolean;
}

export interface CreateUserDto {
  email: string;
  password: string;
  personMode: RegistrationPersonMode;
  existingPersonId?: string | null;
  person?: CreatePersonDto | null;
}

export interface SessionUser {
  id: string;
  email: string;
  primaryPersonId: string | null;
}

export interface UserAccount {
  id: string;
  email: string;
  primaryPersonId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeResponse {
  user: SessionUser | null;
}
