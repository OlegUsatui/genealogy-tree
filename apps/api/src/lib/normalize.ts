import type { CreatePersonDto, CreateRelationshipDto, CreateUserDto, Gender, UpdatePersonDto } from "@family-tree/shared";

import { HttpError } from "./http";

const allowedGenders: Gender[] = ["male", "female", "other", "unknown"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const remotePhotoUrlPattern = /^https?:\/\/\S+$/i;
const dataPhotoUrlPattern = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;
const maxPhotoUrlLength = 500_000;

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePhotoUrl(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxPhotoUrlLength) {
    throw new HttpError(400, "Фото завелике. Оберіть менший файл.");
  }

  if (!remotePhotoUrlPattern.test(normalized) && !dataPhotoUrlPattern.test(normalized)) {
    throw new HttpError(400, "Поле photoUrl має бути http(s) URL або data:image");
  }

  return normalized;
}

function normalizeGender(value: unknown): Gender {
  if (value === undefined || value === null || value === "") {
    return "unknown";
  }

  if (typeof value !== "string" || !allowedGenders.includes(value as Gender)) {
    throw new HttpError(400, "Поле gender має бути одним зі значень: male, female, other, unknown");
  }

  return value as Gender;
}

function normalizeIsLiving(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "boolean") {
    throw new HttpError(400, "Поле isLiving має бути boolean або null");
  }

  return value;
}

export interface NormalizedPersonInput {
  firstName?: string;
  lastName: string | null;
  middleName: string | null;
  maidenName: string | null;
  gender?: Gender;
  birthDate: string | null;
  deathDate: string | null;
  birthPlace: string | null;
  deathPlace: string | null;
  biography: string | null;
  isLiving: boolean | null;
  photoUrl: string | null;
}

export function normalizeCreatePersonDto(input: CreatePersonDto): NormalizedPersonInput & { firstName: string } {
  const firstName = normalizeOptionalString(input.firstName);

  if (!firstName) {
    throw new HttpError(400, "Поле firstName є обов’язковим");
  }

  return {
    firstName,
    lastName: normalizeOptionalString(input.lastName),
    middleName: normalizeOptionalString(input.middleName),
    maidenName: normalizeOptionalString(input.maidenName),
    gender: normalizeGender(input.gender),
    birthDate: normalizeOptionalString(input.birthDate),
    deathDate: normalizeOptionalString(input.deathDate),
    birthPlace: normalizeOptionalString(input.birthPlace),
    deathPlace: normalizeOptionalString(input.deathPlace),
    biography: normalizeOptionalString(input.biography),
    isLiving: normalizeIsLiving(input.isLiving),
    photoUrl: normalizePhotoUrl(input.photoUrl),
  };
}

export function normalizeUpdatePersonDto(input: UpdatePersonDto): Partial<NormalizedPersonInput> {
  const result: Partial<NormalizedPersonInput> = {};

  if ("firstName" in input) {
    const firstName = normalizeOptionalString(input.firstName);

    if (!firstName) {
      throw new HttpError(400, "Поле firstName не може бути порожнім");
    }

    result.firstName = firstName;
  }

  if ("lastName" in input) {
    result.lastName = normalizeOptionalString(input.lastName);
  }

  if ("middleName" in input) {
    result.middleName = normalizeOptionalString(input.middleName);
  }

  if ("maidenName" in input) {
    result.maidenName = normalizeOptionalString(input.maidenName);
  }

  if ("gender" in input) {
    result.gender = normalizeGender(input.gender);
  }

  if ("birthDate" in input) {
    result.birthDate = normalizeOptionalString(input.birthDate);
  }

  if ("deathDate" in input) {
    result.deathDate = normalizeOptionalString(input.deathDate);
  }

  if ("birthPlace" in input) {
    result.birthPlace = normalizeOptionalString(input.birthPlace);
  }

  if ("deathPlace" in input) {
    result.deathPlace = normalizeOptionalString(input.deathPlace);
  }

  if ("biography" in input) {
    result.biography = normalizeOptionalString(input.biography);
  }

  if ("isLiving" in input) {
    result.isLiving = normalizeIsLiving(input.isLiving);
  }

  if ("photoUrl" in input) {
    result.photoUrl = normalizePhotoUrl(input.photoUrl);
  }

  return result;
}

export function normalizeCreateRelationshipDto(input: CreateRelationshipDto): CreateRelationshipDto {
  const type = input.type;
  const person1Id = normalizeOptionalString(input.person1Id);
  const person2Id = normalizeOptionalString(input.person2Id);

  if (type !== "parent_child" && type !== "spouse") {
    throw new HttpError(400, "Поле type має бути або parent_child, або spouse");
  }

  if (!person1Id || !person2Id) {
    throw new HttpError(400, "Поля person1Id і person2Id є обов’язковими");
  }

  if (person1Id === person2Id) {
    throw new HttpError(400, "person1Id і person2Id мають бути різними");
  }

  return {
    type,
    person1Id,
    person2Id,
    startDate: normalizeOptionalString(input.startDate),
    endDate: normalizeOptionalString(input.endDate),
    notes: normalizeOptionalString(input.notes),
  };
}

export interface NormalizedCreateUserInput {
  email: string;
  password: string;
  personMode: "existing" | "new";
  existingPersonId: string | null;
  person: (NormalizedPersonInput & { firstName: string }) | null;
}

export function normalizeCreateUserDto(input: CreateUserDto): NormalizedCreateUserInput {
  const email = normalizeOptionalString(input.email)?.toLowerCase();

  if (!email) {
    throw new HttpError(400, "Поле email є обов’язковим");
  }

  if (!emailPattern.test(email)) {
    throw new HttpError(400, "Поле email має бути коректною електронною адресою");
  }

  if (typeof input.password !== "string" || input.password.length === 0) {
    throw new HttpError(400, "Поле password є обов’язковим");
  }

  if (input.password.length < 8) {
    throw new HttpError(400, "Пароль має містити щонайменше 8 символів");
  }

  if (input.personMode !== "existing" && input.personMode !== "new") {
    throw new HttpError(400, "Потрібно вказати, як додати вас до дерева");
  }

  if (input.personMode === "existing") {
    const existingPersonId = normalizeOptionalString(input.existingPersonId);

    if (!existingPersonId) {
      throw new HttpError(400, "Оберіть себе зі списку");
    }

    return {
      email,
      password: input.password,
      personMode: "existing",
      existingPersonId,
      person: null,
    };
  }

  return {
    email,
    password: input.password,
    personMode: "new",
    existingPersonId: null,
    person: normalizeCreatePersonDto((input.person ?? {}) as CreatePersonDto),
  };
}

export function toDbBoolean(value: boolean | null): number | null {
  if (value === null) {
    return null;
  }

  return value ? 1 : 0;
}
