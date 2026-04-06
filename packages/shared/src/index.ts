export type Gender = "male" | "female" | "other" | "unknown";

export type RelationshipType = "parent_child" | "spouse";

export interface Person {
  id: string;
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
