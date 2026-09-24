import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpLeagueData } from '../../core/league/http-league-data';
import { LeagueData } from '../../core/league/league-data';
import { ClaimPage } from './claim.page';

const NAMES = [
  { id: 'm-1', displayName: 'Trokkie', fullName: 'Korsten, Laurie' },
  { id: 'm-2', displayName: 'Annas', fullName: 'Schnetler, Anrich' },
];

describe('ClaimPage', () => {
  function setup(claim: (id: string) => Promise<void>) {
    // A stand-in for the API client that still satisfies `instanceof HttpLeagueData`.
    const league = Object.assign(Object.create(HttpLeagueData.prototype), {
      unclaimedNames: () => Promise.resolve(NAMES),
      claim,
      clear: () => undefined,
    });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useValue: league }],
    });
    const fixture = TestBed.createComponent(ClaimPage);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('lists unclaimed names and claims the chosen one after confirming', async () => {
    const claimed: string[] = [];
    const { fixture, root } = setup((id) => {
      claimed.push(id);
      return Promise.resolve();
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const names = Array.from(root.querySelectorAll<HTMLButtonElement>('.name'));
    expect(names.map((n) => n.querySelector('strong')?.textContent)).toEqual(['Trokkie', 'Annas']);
    const submit = root.querySelector<HTMLButtonElement>('.primary-button')!;
    expect(submit.disabled).toBe(true);

    names[1].click();
    await fixture.whenStable();
    expect(names[1].getAttribute('aria-checked')).toBe('true');
    submit.click();
    await fixture.whenStable();
    expect(claimed).toEqual([]);
    expect(submit.textContent).toContain('Yes, I am Annas');

    submit.click();
    await fixture.whenStable();
    expect(claimed).toEqual(['m-2']);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows the API reason when the name was taken meanwhile', async () => {
    const { fixture, root } = setup(() =>
      Promise.reject(new Error('That name is no longer available. Choose another.')),
    );
    await fixture.whenStable();
    root.querySelectorAll<HTMLButtonElement>('.name')[0].click();
    await fixture.whenStable();
    const submit = root.querySelector<HTMLButtonElement>('.primary-button')!;
    submit.click();
    await fixture.whenStable();
    submit.click();
    await fixture.whenStable();
    expect(root.querySelector('[role=alert]')?.textContent).toContain('no longer available');
  });
});
