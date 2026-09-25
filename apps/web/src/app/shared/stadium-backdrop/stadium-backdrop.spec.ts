import { TestBed } from '@angular/core/testing';
import { StadiumBackdrop } from './stadium-backdrop';

describe('StadiumBackdrop', () => {
  const originalDecode = HTMLImageElement.prototype.decode;
  afterEach(() => {
    if (originalDecode) HTMLImageElement.prototype.decode = originalDecode;
    else delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
  });

  it('keeps the current image while loading and ignores an outdated response', async () => {
    const pending = new Map<string, () => void>();
    HTMLImageElement.prototype.decode = function () {
      return new Promise<void>((resolve) => pending.set(this.getAttribute('src')!, resolve));
    };
    const fixture = TestBed.createComponent(StadiumBackdrop);
    const select = (src: string) => {
      fixture.componentRef.setInput('src', src);
      fixture.detectChanges();
    };
    const finish = async (src: string) => {
      pending.get(src)!();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
    };
    const current = () => fixture.nativeElement.querySelector('img.visible')?.getAttribute('src');

    select('first.webp');
    await finish('first.webp');
    expect(current()).toBe('first.webp');
    select('slow.webp');
    expect(current()).toBe('first.webp');
    select('latest.webp');
    await finish('latest.webp');
    await finish('slow.webp');
    expect(current()).toBe('latest.webp');
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(2);
  });

  it('decodes a generic fallback when the selected artwork fails', async () => {
    HTMLImageElement.prototype.decode = function () {
      return this.getAttribute('src') === 'missing.webp'
        ? Promise.reject(new Error('Image unavailable'))
        : Promise.resolve();
    };
    const fixture = TestBed.createComponent(StadiumBackdrop);
    fixture.componentRef.setInput('src', 'missing.webp');
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('img.visible')?.getAttribute('src')).toBe(
        'assets/editorial/match-night-ground.png',
      );
    });
  });
});
