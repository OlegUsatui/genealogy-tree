const encoder = new TextEncoder();

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function deriveHash(password: string, salt: string, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);

  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left[index] ^ right[index];
  }

  return result === 0;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, iterationValue, salt, expectedHash] = passwordHash.split("$");

  if (algorithm !== "pbkdf2" || !iterationValue || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number.parseInt(iterationValue, 10);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const derivedHash = await deriveHash(password, salt, iterations);

  return timingSafeEqual(
    new Uint8Array(derivedHash),
    new Uint8Array(base64UrlToBuffer(expectedHash)),
  );
}

export async function hashPassword(password: string, salt: string, iterations = 310_000): Promise<string> {
  const derivedHash = await deriveHash(password, salt, iterations);
  return `pbkdf2$${iterations}$${salt}$${bufferToBase64Url(derivedHash)}`;
}

