import { findDuplicatePersonByIdentity } from "./db";
import { HttpError } from "./http";

type DuplicateIdentityInput = {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  birthDate: string | null | undefined;
};

type DuplicatePerson = {
  id: string;
  firstName: string;
  lastName: string | null;
  middleName: string | null;
};

export function isDuplicatePersonConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;

  return (
    message.includes("idx_global_persons_unique_identity")
    || (message.includes("UNIQUE constraint failed") && message.includes("global_persons"))
  );
}

export async function buildDuplicatePersonHttpError(
  db: D1Database,
  input: DuplicateIdentityInput,
  message: string,
  ignorePersonId?: string,
): Promise<HttpError> {
  const duplicate = await findDuplicatePersonByIdentity(db, input, ignorePersonId);

  return new HttpError(409, message, {
    code: "person_duplicate",
    personId: duplicate?.id ?? null,
    personName: duplicate ? formatDuplicatePersonName(duplicate) : null,
  });
}

export function formatDuplicatePersonName(person: DuplicatePerson): string {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}
