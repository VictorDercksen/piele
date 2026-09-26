import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { MatchPreview } from './match-preview';
import { MatchPreview as Preview } from '../../../core/api/match-centre.models';

const URL = `${environment.apiUrl}/v1/competitions/urc-2026-27/matches/292605/preview`;

const PREVIEW: Preview = {
  revision: 2,
  generatedAt: '2026-10-09T08:00:00Z',
  summary: 'Scarlets host a Benetton side with a new 10.',
  keyFactors: {
    home: [{ text: 'Unchanged front row.', sources: [0] }],
    away: [{ text: 'New Ten starts at fly-half.', sources: [0, 1] }],
  },
  sentiment: {
    home: { score: 2, note: 'Settled camp.', sources: [0] },
    away: { score: -1, note: 'Selection questions.', sources: [1] },
  },
  sources: [
    {
      url: 'https://www.unitedrugby.com/news',
      title: 'Team news',
      publisher: 'URC',
      publishedAt: null,
    },
    {
      url: 'https://www.example.org/benetton',
      title: 'Selection',
      publisher: null,
      publishedAt: null,
    },
  ],
};

describe('MatchPreview', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { configured: true } },
      ],
    });
    const fixture = TestBed.createComponent(MatchPreview);
    fixture.componentRef.setInput('fixtureId', '292605');
    fixture.componentRef.setInput('home', 'Scarlets');
    fixture.componentRef.setInput('away', 'Benetton');
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the summary, both sides and linked sources', async () => {
    const { fixture, http } = setup();
    http.expectOne(URL).flush({ fixtureId: '292605', preview: PREVIEW });
    await settle(fixture);
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.summary')?.textContent).toContain('new 10');
    expect([...element.querySelectorAll('.side h3')].map((h) => h.textContent)).toEqual([
      'Scarlets',
      'Benetton',
    ]);
    expect(element.querySelector('.mood')?.textContent).toBe('Buoyant');
    const links = [...element.querySelectorAll<HTMLAnchorElement>('.sources a')];
    expect(links.map((a) => a.href)).toEqual([
      'https://www.unitedrugby.com/news',
      'https://www.example.org/benetton',
    ]);
    expect(links.every((a) => a.rel.includes('noopener') && a.target === '_blank')).toBe(true);
  });

  it('keeps the sources closed until asked for', async () => {
    const { fixture, http } = setup();
    http.expectOne(URL).flush({ fixtureId: '292605', preview: PREVIEW });
    await settle(fixture);
    const drawer: HTMLDetailsElement = fixture.nativeElement.querySelector('.sources-drawer');
    expect(drawer.open).toBe(false);
    expect(drawer.querySelector('summary')?.textContent).toContain('Sources');
    expect(drawer.querySelector('.count')?.textContent).toBe('2');
  });

  it('fills each mood scale to its step', async () => {
    const { fixture, http } = setup();
    http.expectOne(URL).flush({ fixtureId: '292605', preview: PREVIEW });
    await settle(fixture);
    const meters = [...fixture.nativeElement.querySelectorAll('.meter')] as HTMLElement[];
    expect(meters.map((m) => m.querySelectorAll('i.on').length)).toEqual([5, 2]);
  });

  it('renders agent text as text, never markup', async () => {
    const { fixture, http } = setup();
    const summary = '<img src=x onerror=alert(1)><b>bold</b>';
    http.expectOne(URL).flush({ fixtureId: '292605', preview: { ...PREVIEW, summary } });
    await settle(fixture);
    const paragraph: HTMLElement = fixture.nativeElement.querySelector('.summary');
    expect(paragraph.textContent).toBe(summary);
    expect(paragraph.querySelector('img, b')).toBeNull();
  });

  it('explains when no preview has been written', async () => {
    const { fixture, http } = setup();
    http.expectOne(URL).flush({ fixtureId: '292605', preview: null });
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No preview yet.');
  });

  it('offers a retry when the preview fails to load', async () => {
    const { fixture, http } = setup();
    http.expectOne(URL).flush('down', { status: 503, statusText: 'Unavailable' });
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('The preview could not be loaded.');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(URL).flush({ fixtureId: '292605', preview: PREVIEW });
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.summary')).not.toBeNull();
  });
});
