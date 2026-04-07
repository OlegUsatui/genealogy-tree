const remotePhotoUrlPattern = /^https?:\/\/\S+$/i;
const dataPhotoUrlPattern = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i;
const maxUploadFileSizeBytes = 8 * 1024 * 1024;
const maxEncodedPhotoLength = 450_000;
const compressionVariants = [
  { maxSide: 1400, quality: 0.84 },
  { maxSide: 1100, quality: 0.78 },
  { maxSide: 900, quality: 0.72 },
  { maxSide: 720, quality: 0.68 },
];

export function isSupportedPhotoUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return remotePhotoUrlPattern.test(value) || dataPhotoUrlPattern.test(value);
}

export function buildPhotoInitials(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const parts = [firstName, lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return "FT";
  }

  return parts
    .slice(0, 2)
    .map((value) => value.charAt(0).toLocaleUpperCase("uk-UA"))
    .join("");
}

export function validatePhotoFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new Error("Оберіть файл зображення.");
  }

  if (file.size > maxUploadFileSizeBytes) {
    throw new Error("Фото завелике. Оберіть файл до 8 MB.");
  }
}

export async function optimizePhotoFile(file: File): Promise<string> {
  validatePhotoFile(file);

  const image = await loadImage(file);

  for (const variant of compressionVariants) {
    const canvas = document.createElement("canvas");
    const { width, height } = fitIntoBox(image.naturalWidth, image.naturalHeight, variant.maxSide);
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Браузер не зміг підготувати фото до збереження.");
    }

    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", variant.quality);

    if (dataUrl.length <= maxEncodedPhotoLength) {
      return dataUrl;
    }
  }

  throw new Error("Не вдалося достатньо стиснути фото. Оберіть менший файл.");
}

function fitIntoBox(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) {
    return { width, height };
  }

  const scale = Math.min(maxSide / width, maxSide / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не вдалося прочитати файл зображення."));
    };

    image.src = objectUrl;
  });
}
