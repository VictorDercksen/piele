import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NewLeague } from '../../../core/league/admin.models';
import { AdminService } from '../../../core/league/admin.service';
import { ApiError } from '../../../core/league/http-league-data';
import { CreateLeagueForm, defaultSeasonName } from './create-league-form';

const URC = {
  id: 'urc-2026-27',
  name: 'United Rugby Championship 2026/27',
  shortName: 'URC',
  timezone: 'Africa/Johannesburg',
  regularRounds: 18,
  lastRound: 21,
};

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
}

describe('CreateLeagueForm', () => {
  let sent: NewLeague[];
  let refusal: ApiError | null;

  function setup() {
    sent = [];
    refusal = null;
    const admin = {
      competitions: () => Promise.resolve([URC]),
      create: (body: NewLeague) => {
        sent.push(body);
        return refusal ? Promise.reject(refusal) : Promise.resolve({ slug: body.slug });
      },
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminService, useValue: admin }],
    });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CreateLeagueForm);
    const root = fixture.nativeElement as HTMLElement;
    const field = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#new-league-${id}`)!;
    const type = (id: string, value: string) => {
      const input = field<HTMLInputElement | HTMLTextAreaElement>(id);
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const choose = (id: string, value: string) => {
      const select = field<HTMLSelectElement>(id);
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    const submit = async () => {
      root.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { fixture, root, field, type, choose, submit, navigate };
  }

  it('fills the slug from the name until it is edited, and the season from the competition', async () => {
    const { field, type, fixture } = setup();
    await settle();
    expect(field<HTMLSelectElement>('competitionId').value).toBe('urc-2026-27');
    expect(field<HTMLInputElement>('timezone').value).toBe('Africa/Johannesburg');
    expect(field<HTMLInputElement>('seasonName').value).toBe('URC 2026/27');
    type('name', 'Die Ou Manne');
    TestBed.tick();
    expect(field<HTMLInputElement>('slug').value).toBe('die-ou-manne');
    type('slug', 'ou-manne');
    type('name', 'Die Ou Manne XV');
    TestBed.tick();
    expect(field<HTMLInputElement>('slug').value).toBe('ou-manne');
    expect(fixture.componentInstance.form.controls.slug.value).toBe('ou-manne');
  });

  it('previews the pasted members with each line to fix and offers them as captain', async () => {
    const { root, type, field } = setup();
    await settle();
    type('members', 'Steyn, Doempie, Doempie\nKallie\nKallie Kruger, Kallie');
    await settle();
    expect(root.querySelector('.preview-count')?.textContent).toBe('2 members ready, 1 line to fix.');
    expect(root.querySelector('.line-errors')?.textContent).toContain('Line 2');
    const options = Array.from(field<HTMLSelectElement>('captain').options).map((o) => o.value);
    expect(options).toEqual(['', 'Doempie', 'Kallie']);
  });

  it('sends null as the captain’s email for "me" and opens the new league', async () => {
    const { type, choose, submit, navigate, root } = setup();
    await settle();
    type('name', 'Die Ou Manne');
    type('members', 'Steyn, Doempie, Doempie\nKallie Kruger, Kallie');
    await settle();
    choose('captain', 'Doempie');
    await submit();
    expect(sent).toEqual([
      {
        name: 'Die Ou Manne',
        slug: 'die-ou-manne',
        timezone: 'Africa/Johannesburg',
        competitionId: 'urc-2026-27',
        seasonName: 'URC 2026/27',
        members: [
          { fullName: 'Steyn, Doempie', displayName: 'Doempie' },
          { fullName: 'Kallie Kruger', displayName: 'Kallie' },
        ],
        captainDisplayName: 'Doempie',
        captainEmail: null,
        emblemPreset: null,
        accentColour: null,
        addMe: false,
      },
    ]);
    expect(navigate).toHaveBeenCalledWith('/die-ou-manne');
    expect(root.querySelector('#new-league-captainEmail')).toBeNull();
  });

  it('needs the captain’s email when the captain is someone else, and can add the admin', async () => {
    const { type, choose, submit, root, field } = setup();
    await settle();
    type('name', 'Die Ou Manne');
    type('members', 'Steyn, Doempie, Doempie');
    await settle();
    choose('captain', 'Doempie');
    const me = root.querySelector<HTMLInputElement>('input[formcontrolname="captainIsMe"]')!;
    me.click();
    await settle();
    await submit();
    expect(sent).toEqual([]);
    expect(field('captainEmail').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field('captainEmail'));

    type('captainEmail', 'doempie@example.test');
    root.querySelector<HTMLInputElement>('input[formcontrolname="addMe"]')!.click();
    await submit();
    expect(sent[0]).toMatchObject({ captainEmail: 'doempie@example.test', addMe: true });
  });

  it('shows slug and member refusals beside their fields and others at the top', async () => {
    const { type, choose, submit, root, field, navigate } = setup();
    await settle();
    type('name', 'Die Ou Manne');
    type('members', 'Steyn, Doempie, Doempie');
    await settle();
    choose('captain', 'Doempie');

    refusal = new ApiError(409, 'slug_taken', 'Another league already uses die-ou-manne.');
    await submit();
    expect(field('slug').getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('#new-league-slug-error')?.textContent).toContain('already uses');
    expect(document.activeElement).toBe(field('slug'));

    refusal = new ApiError(422, 'unknown_captain', 'The captain must be one of the members.');
    await submit();
    expect(field('slug').getAttribute('aria-invalid')).toBe('false');
    expect(field('members').getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('.members-grid [role="alert"]')?.textContent).toContain('captain must be');

    refusal = new ApiError(422, 'invalid_timezone', 'Unknown time zone.');
    await submit();
    expect(root.querySelector('#new-league-error')?.textContent).toContain('Unknown time zone.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('names the default season from the registry or the competition name', () => {
    expect(defaultSeasonName(URC)).toBe('URC 2026/27');
    expect(defaultSeasonName({ id: 'x', name: 'Currie Cup 2027', shortName: 'CC' })).toBe('CC 2027');
    expect(defaultSeasonName({ id: 'x', name: 'Friendly', shortName: 'FR' })).toBe('FR');
  });
});
