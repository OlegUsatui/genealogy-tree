type PersonNameLike = {
  firstName: string | null | undefined;
  middleName?: string | null | undefined;
  lastName?: string | null | undefined;
  maidenName?: string | null | undefined;
};

type PersonDisplayNameOptions = {
  order?: "natural" | "surname-first";
};

export function formatPersonDisplayName(
  person: PersonNameLike,
  options: PersonDisplayNameOptions = {},
): string {
  const firstName = normalizeNamePart(person.firstName);
  const middleName = normalizeNamePart(person.middleName);
  const surname = formatSurname(person.lastName, person.maidenName);
  const order = options.order ?? "natural";

  const parts = order === "surname-first"
    ? [surname, firstName, middleName]
    : [firstName, middleName, surname];

  return parts.filter(Boolean).join(" ").trim();
}

function formatSurname(
  lastName: string | null | undefined,
  maidenName: string | null | undefined,
): string | null {
  const normalizedLastName = normalizeNamePart(lastName);
  const normalizedMaidenName = normalizeNamePart(maidenName);

  if (!normalizedLastName) {
    return normalizedMaidenName;
  }

  if (!normalizedMaidenName || isSameNamePart(normalizedLastName, normalizedMaidenName)) {
    return normalizedLastName;
  }

  return `${normalizedLastName} (${normalizedMaidenName})`;
}

function normalizeNamePart(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isSameNamePart(left: string, right: string): boolean {
  return left.toLocaleLowerCase("uk-UA") === right.toLocaleLowerCase("uk-UA");
}
