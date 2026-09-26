import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LeagueCrest } from './league-crest';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const SIGNED = 'https://storage.test/emblems/l-1/abc.jpg?token=t';

describe('LeagueCrest', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }),
  );

  function crest(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(LeagueCrest);
    fixture.componentRef.setInput('name', 'Pofadder Bowl');
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }

  it('draws a preset crest in the accent colour', () => {
    const fixture = crest({ emblemPreset: 'anvil', accentColour: '#c8742a' });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('use')?.getAttribute('href')).toBe(
      'assets/images/emblems/anvil.svg#emblem',
    );
    expect(host.style.getPropertyValue('--crest-accent')).toBe('#c8742a');
    expect(host.classList.contains('accented')).toBe(true);
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('ignores an unknown preset and a malformed colour', () => {
    const fixture = crest({ emblemPreset: 'dragon', accentColour: 'red' });
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('use')).toBeNull();
    expect(host.querySelector('.monogram')?.textContent).toBe('PB');
    expect(host.classList.contains('accented')).toBe(false);
  });

  it('shows the Piele crest for the first league and a tinted monogram elsewhere', () => {
    const piele = crest({ slug: 'piele' });
    expect(piele.nativeElement.querySelector('img')?.getAttribute('src')).toBe(
      'assets/images/piele-crest.png',
    );
    const other = crest({ slug: 'sample-third', accentColour: '#3f8f6b' });
    expect(other.nativeElement.querySelector('.monogram')?.textContent).toBe('PB');
    expect(other.nativeElement.classList.contains('accented')).toBe(true);
  });

  it('prefers an uploaded emblem over the preset and the Piele crest', () => {
    const image = 'data:image/jpeg;base64,/9j/4AAQ';
    const fixture = crest({ slug: 'piele', emblemPreset: 'oak', emblemUrl: image });
    expect(fixture.nativeElement.querySelector('img.upload')?.getAttribute('src')).toBe(image);
  });

  it('downloads a signed emblem URL and shows it once it proves to be an image', async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = crest({ emblemUrl: SIGNED, emblemPreset: null });
    // Until the bytes arrive the monogram stands in.
    expect(fixture.nativeElement.querySelector('.monogram')).not.toBeNull();
    await Promise.resolve();
    http.expectOne(SIGNED).flush(new Blob([JPEG]));
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img.upload')?.getAttribute('src')).toMatch(
      /^data:image\/jpeg;base64,/,
    );

    const bad = crest({ emblemUrl: `${SIGNED}&other`, emblemPreset: null });
    await Promise.resolve();
    http.expectOne(`${SIGNED}&other`).flush(new Blob(['<svg/>']));
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve));
    bad.detectChanges();
    expect(bad.nativeElement.querySelector('img.upload')).toBeNull();
    http.verify();
  });
});
