import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, inject, signal } from '@angular/core';

/**
 * Uploaded league emblems. The API hands out signed Storage URLs, which the
 * Content-Security-Policy keeps out of `<img>`; the bytes are fetched like the profile photo
 * and shown as a data URL once they prove to be a JPEG, PNG or WebP image. Local asset paths
 * and data URLs pass straight through.
 */
@Injectable({ providedIn: 'root' })
export class EmblemImages {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Signal<string | null>>();

  /** The image to show for an emblem URL: null until it has loaded, and if it cannot. */
  resolve(url: string): Signal<string | null> {
    if (url.startsWith('data:image/') || url.startsWith('assets/')) return signal(url).asReadonly();
    let image = this.cache.get(url);
    if (!image) {
      const state = signal<string | null>(null);
      image = state.asReadonly();
      this.cache.set(url, image);
      // Deferred so a template reading the signal never starts I/O mid-render.
      queueMicrotask(() =>
        this.http.get(url, { responseType: 'blob' }).subscribe({
          next: (blob) => void imageDataUrl(blob).then((dataUrl) => state.set(dataUrl)),
          error: () => state.set(null),
        }),
      );
    }
    return image;
  }
}

/** The bytes as a data URL when they are a JPEG, PNG or WebP image, else null. */
export async function imageDataUrl(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = imageType(bytes);
  if (!type) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(new Blob([bytes], { type }));
  });
}

function imageType(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const text = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length > 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
