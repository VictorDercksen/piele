import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertService } from '../../core/feedback/alert.service';
import { problemTarget } from '../../core/feedback/problem-highlight';
import { LeagueContext } from '../../core/league/league-context';
import { LeagueData } from '../../core/league/league-data';
import { SampleLeagueData } from '../../core/league/sample-league-data';
import { ProfileStore } from '../../core/profile/profile.store';
import { ProfileEditor } from './profile-editor';

describe('ProfileEditor', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: LeagueData, useClass: SampleLeagueData }],
    });
  });
  afterEach(() => localStorage.clear());

  async function setup() {
    const context = TestBed.inject(LeagueContext);
    await context.ensureAccount();
    await context.select('piele');
    const fixture = TestBed.createComponent(ProfileEditor);
    const root = fixture.nativeElement as HTMLElement;
    const alerts = TestBed.inject(AlertService);
    await fixture.whenStable();
    const name = root.querySelector<HTMLInputElement>('#display-name')!;
    const radios = () => Array.from(root.querySelectorAll<HTMLInputElement>('.team-options input'));
    const photo = root.querySelector<HTMLInputElement>('input[type=file]')!;
    const submit = async () => {
      root.querySelector<HTMLButtonElement>('.save-button')!.click();
      await fixture.whenStable();
    };
    return { fixture, root, alerts, name, radios, photo, submit };
  }

  it('warns once about the name and the team and highlights the name', async () => {
    const { root, alerts, name, radios, submit } = await setup();
    const warn = vi.spyOn(alerts, 'warn');
    name.value = '';
    name.dispatchEvent(new Event('input'));

    await submit();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Enter your name to continue.', {
      key: 'profile',
      details: ['Choose the team you support.'],
    });
    expect(name.classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(name);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('[role=radiogroup]')?.getAttribute('aria-invalid') === 'true').toBe(
      true,
    );
    expect(root.querySelector('.validation, [role=alert]')).toBeNull();

    name.value = 'Victor';
    name.dispatchEvent(new Event('input'));
    await submit();
    expect(warn).toHaveBeenLastCalledWith('Choose the team you support.', {
      key: 'profile',
      details: [],
    });
    expect(problemTarget(radios()[0]).classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(radios()[0]);
    expect(alerts.alerts()).toHaveLength(1);
  });

  it('warns about a photo it cannot use and highlights the file field', async () => {
    const { fixture, alerts, photo } = await setup();
    const warn = vi.spyOn(alerts, 'warn');
    const file = new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' });
    Object.defineProperty(photo, 'files', { value: [file], configurable: true });
    photo.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(warn).toHaveBeenCalledWith('Choose a JPG, PNG or WebP photo.', {
      key: 'profile-photo',
    });
    expect(photo.getAttribute('aria-invalid')).toBe('true');
    expect(problemTarget(photo).classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(photo);
  });

  it('shows a failed save as a red card, cleared when the editor closes', async () => {
    const { fixture, root, alerts, name, radios, submit } = await setup();
    vi.spyOn(TestBed.inject(ProfileStore), 'save').mockRejectedValue(
      new Error(
        'Your browser could not save this profile. Enable local storage or try a smaller photo.',
      ),
    );
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    name.value = 'Victor';
    name.dispatchEvent(new Event('input'));
    radios()[0].click();
    await submit();
    expect(saved).not.toHaveBeenCalled();
    expect(alerts.alerts()).toMatchObject([{ severity: 'error', key: 'profile', timeout: null }]);
    expect(alerts.alerts()[0].message).toContain('could not save this profile');
    expect(root.querySelector('[role=alert]')).toBeNull();

    fixture.destroy();
    expect(alerts.alerts()).toEqual([]);
  });
});
