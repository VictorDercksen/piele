import { Injectable, computed, signal } from '@angular/core';
import { club } from '../teams';

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  readonly profile = signal<LocalProfile | null>(this.read());
  readonly team = computed(() => club(this.profile()?.teamId ?? ''));
  readonly initials = computed(() =>
    (this.profile()?.displayName ?? 'You')
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase(),
  );
  save(profile: LocalProfile): void {
    if (!isProfile(profile)) throw new Error('Enter a name and choose a favourite team.');
    try {
      localStorage.setItem('piele-profile-v1', JSON.stringify(profile));
    } catch {
      throw new Error(
        'Your browser could not save this profile. Enable local storage or try a smaller photo.',
      );
    }
    this.profile.set(profile);
  }
  private read(): LocalProfile | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('piele-profile-v1') ?? 'null');
      return isProfile(value) ? value : null;
    } catch {
      return null;
    }
  }
}

export interface LocalProfile {
  displayName: string;
  teamId: string;
  photo: string | null;
}

export function isProfile(value: unknown): value is LocalProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile['displayName'] === 'string' &&
    profile['displayName'].trim().length > 0 &&
    profile['displayName'].length <= 50 &&
    typeof profile['teamId'] === 'string' &&
    !!club(profile['teamId']) &&
    (profile['photo'] === null ||
      (typeof profile['photo'] === 'string' &&
        profile['photo'].length < 500000 &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(profile['photo'])))
  );
}

export async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This photo could not be opened. Choose a different image.');
  }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('This photo is empty.');
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 384;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable in this browser.');
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = '#182a38';
    context.fillRect(0, 0, 384, 384);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      384,
      384,
    );
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    bitmap.close();
  }
}
