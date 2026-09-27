import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AlertService } from '../../../core/feedback/alert.service';
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

  function setup(competitions: readonly (typeof URC)[] = [URC]) {
    sent = [];
    refusal = null;
    const admin = {
      competitions: () => Promise.resolve(competitions),
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
    const alerts = TestBed.inject(AlertService);
    const warn = vi.spyOn(alerts, 'warn');
    const error = vi.spyOn(alerts, 'error');
    const fixture = TestBed.createComponent(CreateLeagueForm);
    const root = fixture.nativeElement as HTMLElement;
    const field = <T extends HTMLElement>(id: string) =>
      root.querySelector<T>(`#new-league-${id}`)!;
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
    /** Types a member into a row of the team sheet, adding rows as needed. */
    const member = async (row: number, name: string, surname: string, superbru: string) => {
      while (!root.querySelector(`#new-league-member-${row}-name`)) {
        root.querySelector<HTMLButtonElement>('.add-row')!.click();
        await settle();
      }
      type(`member-${row}-name`, name);
      type(`member-${row}-surname`, surname);
      type(`member-${row}-superbru`, superbru);
      await settle();
    };
    const submit = async () => {
      root.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { fixture, root, field, type, choose, member, submit, navigate, warn, error };
  }

  afterEach(() => TestBed.inject(AlertService).clear());

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

  it('starts with three rows, adds one with "Add member" and offers the members as captain', async () => {
    const { root, member, field, submit, type, choose, warn } = setup();
    await settle();
    expect(root.querySelectorAll('.member-row').length).toBe(3);
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    await member(1, 'Kallie', '', '');
    await member(3, 'Thabo', 'Nkosi', 'Thabo');
    expect(root.querySelectorAll('.member-row').length).toBe(4);
    expect(document.activeElement).toBe(field('member-3-name'));
    expect(root.querySelector('.preview-count')?.textContent).toBe('2 members ready.');
    const options = Array.from(field<HTMLSelectElement>('captain').options).map((o) => o.value);
    expect(options).toEqual(['', 'Doempie', 'Thabo']);

    // An unfinished row is pointed out once the admin tries to submit.
    type('name', 'Die Ou Manne');
    choose('captain', 'Thabo');
    await submit();
    expect(sent).toEqual([]);
    expect(root.querySelector('.preview-count')?.textContent).toBe(
      '2 members ready, 1 row to fix.',
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Member 2: Add the Superbru name.', {
      key: 'create-league',
      details: [],
    });
    expect(field('member-1-superbru').getAttribute('aria-invalid')).toBe('true');
    expect(field('member-1-superbru').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('member-1-superbru'));
  });

  it('gathers every problem into one warning and highlights the first', async () => {
    const { root, member, field, submit, warn } = setup();
    await settle();
    await member(1, 'Kallie', '', '');
    await member(2, '', '', 'Sanet');
    await submit();
    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Give the league a name.', {
      key: 'create-league',
      details: [
        'Give the league a slug for its address.',
        'Member 2: Add the Superbru name.',
        'and 2 more.',
      ],
    });
    expect(field('name').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('name'));
    for (const id of ['name', 'slug', 'member-1-superbru', 'captain'])
      expect(field(id).getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('.field-error')).toBeNull();

    // The next attempt replaces the card rather than adding one.
    await submit();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(TestBed.inject(AlertService).alerts().length).toBe(1);
  });

  it('warns once when a repeated Superbru name first appears', async () => {
    const { member, type, field, warn } = setup();
    await settle();
    await member(0, 'Doempie', 'Steyn', 'Thabo');
    await member(1, 'Thabo', 'Nkosi', 'Thab');
    expect(warn).not.toHaveBeenCalled();
    type('member-1-superbru', 'Thabo');
    await settle();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Member 2: Thabo is already member 1.', {
      key: 'create-league',
    });
    expect(field('member-1-superbru').getAttribute('aria-invalid')).toBe('true');
    // Typing on in another input of the row does not warn again.
    type('member-1-surname', 'Nkosi Jr');
    await settle();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('removes a row and drops a captain whose row went', async () => {
    const { root, member, choose, fixture } = setup();
    await settle();
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    await member(1, 'Thabo', 'Nkosi', 'Thabo');
    choose('captain', 'Thabo');
    root.querySelector<HTMLButtonElement>('[aria-label="Remove member 2"]')!.click();
    await settle();
    expect(root.querySelectorAll('.member-row').length).toBe(2);
    expect(fixture.componentInstance.controls.captain.value).toBe('');
  });

  it('sends null as the captain’s email for "me" and opens the new league', async () => {
    const { type, choose, member, submit, navigate, root } = setup();
    await settle();
    type('name', 'Die Ou Manne');
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    await member(1, 'Kallie', 'Kruger', 'Kallie');
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
          { fullName: 'Doempie Steyn', displayName: 'Doempie' },
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
    const { type, choose, member, submit, root, field } = setup();
    await settle();
    type('name', 'Die Ou Manne');
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    choose('captain', 'Doempie');
    const me = root.querySelector<HTMLInputElement>('input[formcontrolname="captainIsMe"]')!;
    me.click();
    await settle();
    await submit();
    expect(sent).toEqual([]);
    expect(field('captainEmail').getAttribute('aria-invalid')).toBe('true');
    expect(field('captainEmail').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('captainEmail'));

    type('captainEmail', 'doempie@example.test');
    root.querySelector<HTMLInputElement>('input[formcontrolname="addMe"]')!.click();
    await submit();
    expect(sent[0]).toMatchObject({ captainEmail: 'doempie@example.test', addMe: true });
  });

  it('warns about field refusals at their field and shows others as an error', async () => {
    const { type, choose, member, submit, field, navigate, warn, error } = setup();
    await settle();
    type('name', 'Die Ou Manne');
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    choose('captain', 'Doempie');

    refusal = new ApiError(409, 'slug_taken', 'Another league already uses die-ou-manne.');
    await submit();
    expect(warn).toHaveBeenLastCalledWith('Another league already uses die-ou-manne.', {
      key: 'create-league',
      details: [],
    });
    expect(field('slug').getAttribute('aria-invalid')).toBe('true');
    expect(field('slug').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('slug'));

    refusal = new ApiError(422, 'unknown_captain', 'The captain must be one of the members.');
    await submit();
    expect(field('slug').getAttribute('aria-invalid')).toBe('false');
    expect(warn).toHaveBeenLastCalledWith('The captain must be one of the members.', {
      key: 'create-league',
      details: [],
    });
    expect(field('captain').getAttribute('aria-invalid')).toBe('true');
    expect(field('captain').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('captain'));

    refusal = new ApiError(409, 'duplicate_member', 'Doempie is on the team sheet twice.');
    await submit();
    expect(field('member-0-superbru').getAttribute('aria-invalid')).toBe('true');
    expect(field('member-0-superbru').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('member-0-superbru'));

    refusal = new ApiError(422, 'invalid_timezone', 'Unknown time zone.');
    await submit();
    expect(error).toHaveBeenCalledWith('Unknown time zone.', { key: 'create-league' });
    expect(warn).toHaveBeenCalledTimes(3);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps Piele’s rules collapsed and sends only the rules that differ', async () => {
    const { type, choose, member, submit, root, field } = setup();
    await settle();
    const group = root.querySelector<HTMLDetailsElement>('#new-league-rules')!;
    expect(group.open).toBe(false);
    expect(field<HTMLInputElement>('rules-marginWindow').value).toBe('5');
    expect(field<HTMLInputElement>('rules-defaultPicks').checked).toBe(true);
    expect(root.querySelector('#new-league-rules-previousChampionMemberId')).toBeNull();
    type('name', 'Die Ou Manne');
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    choose('captain', 'Doempie');
    field<HTMLInputElement>('rules-defaultPicks').click();
    type('rules-grandSlamPoints', '3');
    type('rules-win-final', '4');
    await submit();
    expect(sent[0].rules).toEqual({
      defaultPicks: false,
      winPoints: { regular: 1, quarterFinal: 1.5, semiFinal: 2, final: 4 },
      grandSlamPoints: 3,
    });
  });

  it('opens the rules and highlights a rule to fix', async () => {
    const { type, choose, member, submit, root, field, warn } = setup();
    await settle();
    type('name', 'Die Ou Manne');
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    choose('captain', 'Doempie');
    type('rules-startingRound', '19');
    await submit();
    expect(sent).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Starting round: choose a round from 1 to 18.', {
      key: 'create-league',
      details: [],
    });
    expect(root.querySelector<HTMLDetailsElement>('#new-league-rules')!.open).toBe(true);
    expect(field('rules-startingRound').getAttribute('aria-invalid')).toBe('true');
    expect(field('rules-startingRound').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(field('rules-startingRound'));
  });

  it("bounds the starting round by the chosen competition's regular rounds", async () => {
    const short = {
      ...URC,
      id: 'short-cup-2027',
      name: 'Short Cup 2027',
      shortName: 'SC',
      regularRounds: 10,
    };
    const { type, choose, member, submit, field, fixture } = setup([short, URC]);
    await settle();
    expect(fixture.componentInstance.lastRound()).toBe(10);
    type('name', 'Die Ou Manne');
    await member(0, 'Doempie', 'Steyn', 'Doempie');
    choose('captain', 'Doempie');
    type('rules-startingRound', '11');
    await submit();
    expect(sent).toEqual([]);
    expect(field('rules-startingRound').getAttribute('aria-invalid')).toBe('true');
    choose('competitionId', URC.id);
    await settle();
    expect(fixture.componentInstance.lastRound()).toBe(18);
    await submit();
    expect(sent[0].rules).toEqual({ startingRound: 11 });
  });

  it('names the default season from the registry or the competition name', () => {
    expect(defaultSeasonName(URC)).toBe('URC 2026/27');
    expect(defaultSeasonName({ id: 'x', name: 'Currie Cup 2027', shortName: 'CC' })).toBe(
      'CC 2027',
    );
    expect(defaultSeasonName({ id: 'x', name: 'Friendly', shortName: 'FR' })).toBe('FR');
  });
});
