import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AlertService } from '../../core/feedback/alert.service';
import { ApiError } from '../../core/api/api-error';
import { JoinControlService } from '../../core/league/join/join-control.service';
import { JoinService } from '../../core/league/join/join.service';
import { LeagueContext } from '../../core/league/league-context';
import { JoinPreview } from '../../core/league/league.models';
import { JoinPage } from './join.page';

const LEAGUE: JoinPreview['league'] = {
  id: 'l-2',
  slug: 'pofadder-bowl',
  name: 'Pofadder Bowl',
  timezone: 'Africa/Johannesburg',
  emblemPreset: null,
  emblemUrl: null,
  accentColour: null,
  competition: { id: 'urc-2026-27', name: 'United Rugby Championship 2026/27', shortName: 'URC' },
  seasonName: 'URC 2026/27',
};

const NAMES = [
  { id: 'm-1', displayName: 'Trokkie' },
  { id: 'm-2', displayName: 'Annas' },
];

describe('JoinPage', () => {
  function setup(joins: Partial<Pick<JoinService, 'preview'> & Pick<JoinControlService, 'claim'>>, reloads: string[] = []) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: JoinService, useValue: joins },
        { provide: JoinControlService, useValue: joins },
        {
          provide: LeagueContext,
          useValue: { reloadAccount: () => Promise.resolve(reloads.push('me')) },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ code: 'abc123def456' }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(JoinPage);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('lists the league’s unclaimed names and claims the chosen one after confirming', async () => {
    const claimed: string[] = [];
    const reloads: string[] = [];
    const { fixture, root } = setup(
      {
        preview: () => Promise.resolve({ league: LEAGUE, alreadyMember: false, unclaimed: NAMES }),
        claim: (code: string, id: string) => {
          claimed.push(`${code}:${id}`);
          return Promise.resolve();
        },
      },
      reloads,
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    expect(root.querySelector('.eyebrow')?.textContent).toContain('POFADDER BOWL');
    expect(root.querySelector('app-member-avatar')?.textContent).toContain('PB');
    const names = Array.from(root.querySelectorAll<HTMLLabelElement>('.name'));
    expect(names.map((n) => n.querySelector('strong')?.textContent)).toEqual(['Trokkie', 'Annas']);
    const submit = root.querySelector<HTMLButtonElement>('.primary-button')!;
    expect(submit.disabled).toBe(true);

    names[1].click();
    await fixture.whenStable();
    expect(String(names[1].querySelector<HTMLInputElement>('input')?.checked)).toBe('true');
    submit.click();
    await fixture.whenStable();
    expect(claimed).toEqual([]);
    expect(submit.textContent).toContain('Yes, I am Annas');

    submit.click();
    await fixture.whenStable();
    expect(claimed).toEqual(['abc123def456:m-2']);
    expect(reloads).toEqual(['me']);
    expect(navigate).toHaveBeenCalledWith('/pofadder-bowl');
  });

  it('shows the API reason as a red card when the name was taken meanwhile', async () => {
    let previews = 0;
    const { fixture, root } = setup({
      preview: () => {
        previews++;
        return Promise.resolve({ league: LEAGUE, alreadyMember: false, unclaimed: NAMES });
      },
      claim: () =>
        Promise.reject(new ApiError(409, 'name_taken', 'That name is no longer available.')),
    });
    const alerts = TestBed.inject(AlertService);
    const error = vi.spyOn(alerts, 'error');
    await fixture.whenStable();
    root.querySelectorAll<HTMLLabelElement>('.name')[0].click();
    await fixture.whenStable();
    const submit = root.querySelector<HTMLButtonElement>('.primary-button')!;
    submit.click();
    await fixture.whenStable();
    submit.click();
    await fixture.whenStable();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('That name is no longer available.', { key: 'join' });
    // The names were read again, and nothing inline repeats the card.
    expect(previews).toBe(2);
    expect(root.querySelector('[role=alert]')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toContain('Which one is you?');

    fixture.destroy();
    expect(alerts.alerts()).toEqual([]);
  });

  it('opens the league for an account that is already in it', async () => {
    const { fixture, root } = setup({
      preview: () => Promise.resolve({ league: LEAGUE, alreadyMember: true, unclaimed: [] }),
    });
    await fixture.whenStable();
    expect(root.querySelector('h1')?.textContent).toContain("You're in.");
    expect(root.querySelector('a.primary-button')?.getAttribute('href')).toBe('/pofadder-bowl');
    expect(root.querySelector('.names')).toBeNull();
  });

  it('explains a link that does not work', async () => {
    const { fixture, root } = setup({
      preview: () =>
        Promise.reject(new ApiError(404, 'unknown_join_code', 'That join link is not valid.')),
    });
    await fixture.whenStable();
    expect(root.querySelector('h1')?.textContent).toContain('That link does not work.');
    expect(root.textContent).toContain('That join link is not valid.');
  });
});
