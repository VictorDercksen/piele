/** Validates an image and crops it to a 384 px square JPEG data URL. */
export function preparePhoto(file: File): Promise<string> {
  return prepareSquareImage(file, 384, 'photo');
}

/** A league emblem: the same checks, cropped to a 512 px square JPEG data URL. */
export function prepareEmblem(file: File): Promise<string> {
  return prepareSquareImage(file, 512, 'image');
}

/** Validates an image and centre-crops it to a square JPEG data URL of `size` pixels. */
async function prepareSquareImage(file: File, size: number, noun: string): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error(`Choose a JPG, PNG or WebP ${noun}.`);
  if (file.size > 5 * 1024 * 1024) throw new Error(`Choose a ${noun} smaller than 5 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`This ${noun} could not be opened. Choose a different image.`);
  }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error(`This ${noun} is empty.`);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = '#182a38';
    context.fillRect(0, 0, size, size);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    bitmap.close();
  }
}

/** The JPEG bytes of a prepared photo, for upload. Avoids fetch(), which the CSP blocks for data URLs. */
export function jpegBlob(dataUrl: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

/** A downloaded photo as a JPEG data URL, or null when the bytes are not a JPEG. */
export async function jpegDataUrl(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(new Blob([bytes], { type: 'image/jpeg' }));
  });
}
