import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AlertService } from '../../core/feedback/alert.service';
import { problemTarget } from '../../core/feedback/problem-highlight';
import { LeagueContext } from '../../core/league/league-context';
import { LeagueData } from '../../core/league/league-data';
import { SampleLeagueData } from '../../core/league/sample-league-data';
import { CaptainPage } from './captain.page';

async function settle() {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve));
  TestBed.tick();
}

/** The sample build's captain's desk for Piele. */
async function open() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'captain', component: CaptainPage }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LeagueData, useClass: SampleLeagueData },
    ],
  });
  const context = TestBed.inject(LeagueContext);
  await context.ensureAccount();
  await context.select('piele');
  const alerts = TestBed.inject(AlertService);
  const warn = vi.spyOn(alerts, 'warn');
  const error = vi.spyOn(alerts, 'error');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/captain', CaptainPage);
  harness.detectChanges();
  await settle();
  const root = harness.routeNativeElement!;
  const button = (name: string, scope: ParentNode = root) =>
    [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent!.replace(/\s+/g, ' ').trim() === name,
    )!;
  const input = (selector: string) => root.querySelector<HTMLInputElement>(selector)!;
  const type = (selector: string, value: string) => {
    const field = input(selector);
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  return {
    root,
    button,
    input,
    type,
    alerts,
    warn,
    error,
    data: TestBed.inject(LeagueData),
  };
}

describe('CaptainPage notices', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.inject(AlertService).clear();
    vi.restoreAllMocks();
  });

  it('warns about a new member without a name and highlights the nickname', async () => {
    const { root, button, input, warn } = await open();
    const form = root.querySelector('form.add-member')!;
    button('Add member', form).click();
    await settle();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Give the member a nickname and full name.', {
      key: 'captain-add-member',
      details: [],
    });
    expect(input('#new-member-name').getAttribute('aria-invalid')).toBe('true');
    expect(input('#new-member-fullName').getAttribute('aria-invalid')).toBe('true');
    expect(input('#new-member-email').getAttribute('aria-invalid')).toBe('false');
    expect(input('#new-member-name').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(input('#new-member-name'));
    expect(root.querySelector('.error-message, [role="alert"]')).toBeNull();
  });

  it('warns about a new member’s email alone and highlights it', async () => {
    const { root, button, input, type, warn } = await open();
    type('#new-member-name', 'Kallie');
    type('#new-member-fullName', 'Kallie Kotze');
    type('#new-member-email', 'not an email');
    button('Add member', root.querySelector('form.add-member')!).click();
    await settle();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Enter a valid email address.', {
      key: 'captain-add-member',
      details: [],
    });
    expect(input('#new-member-name').getAttribute('aria-invalid')).not.toBe('true');
    expect(input('#new-member-email').getAttribute('aria-invalid')).toBe('true');
    expect(input('#new-member-email').classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(input('#new-member-email'));
  });

  it('shows a failed add as an error card', async () => {
    const { root, button, type, warn, error, data } = await open();
    vi.spyOn(data, 'addMember').mockRejectedValue(new Error('The API is away.'));
    type('#new-member-name', 'Kallie');
    type('#new-member-fullName', 'Kallie Kotze');
    button('Add member', root.querySelector('form.add-member')!).click();
    await settle();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('The API is away.', { key: 'captain-add-member' });
  });

  it('warns about a reserved email on its row and highlights that row’s input', async () => {
    const { root, input, type, warn, data } = await open();
    await data.addMember({ name: 'Kallie', fullName: 'Kallie Kotze', email: null });
    await settle();
    const unclaimed = data.members().find((m) => !m.claimed)!;
    root
      .querySelector<HTMLButtonElement>(
        `button[aria-label="Reserve ${unclaimed.name} for an email"]`,
      )!
      .click();
    await settle();
    const selector = `#email-${unclaimed.id}`;
    type(selector, 'nope');
    const row = input(selector).closest('.member-edit')!;
    [...row.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent!.trim() === 'Save')!
      .click();
    await settle();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Enter a valid email address.', {
      key: 'captain-member-email',
    });
    expect(input(selector).getAttribute('aria-invalid')).toBe('true');
    expect(input(selector).classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(input(selector));
  });

  it('shows a refused copy as an error card that keeps the link', async () => {
    const { root, error } = await open();
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const card = root.querySelector('app-join-link-card')!;
    const link = card.querySelector<HTMLInputElement>('#join-link-url')!.value;
    [...card.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent!.includes('Copy link'))!
      .click();
    await settle();
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      `This browser did not allow copying. Select the link and copy it: ${link}`,
      { key: 'captain-join-link' },
    );
    expect(card.querySelector('.error-message, [role="alert"]')).toBeNull();
  });

  it('warns about an emblem file of the wrong type and highlights the upload', async () => {
    const { root, input, warn, error } = await open();
    const file = input('#emblem-file');
    Object.defineProperty(file, 'files', {
      value: [new File(['text'], 'notes.txt', { type: 'text/plain' })],
      configurable: true,
    });
    file.dispatchEvent(new Event('change'));
    await settle();
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Choose a JPG, PNG or WebP image.', {
      key: 'captain-appearance',
    });
    expect(file.getAttribute('aria-invalid')).toBe('true');
    expect(problemTarget(file).classList).toContain('problem-flag');
    expect(document.activeElement).not.toBe(file);
    expect(root.querySelector('app-appearance-card .error-message')).toBeNull();
  });
});
