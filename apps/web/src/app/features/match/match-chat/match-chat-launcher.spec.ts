import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { ClubTeam } from '../../../core/competition/competition.models';
import { competition } from '../../../core/competition/registry';
import { ChatThread } from '../../../core/league/chat/chat.models';
import { LeagueContext } from '../../../core/league/league-context';
import { ProfileService } from '../../../core/profile/profile.service';
import { MatchChatLauncher } from './match-chat-launcher';

const URL = `${environment.apiUrl}/v1/leagues/league-1/matches/292605/chat`;

const THREAD: ChatThread = {
  fixtureId: '292605',
  open: true,
  remainingInThread: 6,
  remainingToday: 20,
  messages: [],
};

describe('MatchChatLauncher', () => {
  const root = document.body;

  function setup(
    league: { id: string } | null = { id: 'league-1' },
    team: ClubTeam | undefined = undefined,
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { configured: true, accessToken: async () => 'token' } },
        { provide: LeagueContext, useValue: { current: signal(league) } },
        { provide: ProfileService, useValue: { team: signal(team) } },
      ],
    });
    const fixture = TestBed.createComponent(MatchChatLauncher);
    fixture.componentRef.setInput('fixtureId', '292605');
    fixture.componentRef.setInput('home', 'Scarlets');
    fixture.componentRef.setInput('away', 'Benetton');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    return { fixture, host, http: TestBed.inject(HttpTestingController) };
  }

  async function settle(fixture: ComponentFixture<unknown>) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const dialog = () => root.querySelector<HTMLElement>('[role=dialog]');

  it('shows once the thread is read and opens the sheet, focus going back on Escape', async () => {
    const { fixture, host, http } = setup();
    expect(host.classList.contains('shown')).toBe(false);
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    expect(host.classList.contains('shown')).toBe(true);
    const launcher = host.querySelector<HTMLButtonElement>('button.launcher')!;
    expect(launcher.getAttribute('aria-label')).toBe('Ask the Pavilion');
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(launcher.querySelector('ng-icon')?.getAttribute('name')).toBe('lucideBot');

    launcher.click();
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    expect(dialog()).not.toBeNull();
    expect(launcher.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('.chips button').length).toBe(4);

    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await settle(fixture);
    expect(dialog()).toBeNull();
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(launcher);
  });

  it('stays hidden while the API has the chat switched off', async () => {
    const { fixture, host, http } = setup();
    http
      .expectOne(URL)
      .flush({ detail: { code: 'chat_off', message: 'Off.' } }, { status: 404, statusText: 'No' });
    await settle(fixture);
    expect(host.classList.contains('shown')).toBe(false);
    expect(getComputedStyle(host).display).toBe('none');
  });

  it('stays hidden, asking nothing, while the chat has nowhere to ask', async () => {
    const { fixture, host, http } = setup(null);
    await settle(fixture);
    http.expectNone(() => true);
    expect(host.classList.contains('shown')).toBe(false);
  });

  it('shows for a failed read, so the sheet can offer a retry', async () => {
    const { fixture, host, http } = setup();
    http.expectOne(URL).flush('down', { status: 503, statusText: 'Unavailable' });
    await settle(fixture);
    expect(host.classList.contains('shown')).toBe(true);
  });

  it('stays hidden once the match has kicked off and the API reports the chat closed', async () => {
    const { fixture, host, http } = setup();
    http.expectOne(URL).flush({ ...THREAD, open: false });
    await settle(fixture);
    expect(host.classList.contains('shown')).toBe(false);
    http.verify();
  });

  it('reads the thread of each fixture the page moves to, once', async () => {
    const { fixture, host, http } = setup();
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    fixture.componentRef.setInput('fixtureId', '292606');
    await settle(fixture);
    expect(host.classList.contains('shown')).toBe(false);
    http.expectOne(URL.replace('292605', '292606')).flush({ ...THREAD, fixtureId: '292606' });
    await settle(fixture);
    expect(host.classList.contains('shown')).toBe(true);
    http.verify();
  });

  it("wears the member's club on the button, the scarf and their questions", async () => {
    const { fixture, host, http } = setup(
      undefined,
      competition('urc-2026-27').team('dhl-stormers'),
    );
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    const launcher = host.querySelector<HTMLButtonElement>('button.launcher')!;
    expect(launcher.classList.contains('club')).toBe(true);
    expect(launcher.style.getPropertyValue('--club')).toBe('#174da0');
    expect(launcher.style.getPropertyValue('--club-accent')).toBe('#87baff');

    launcher.click();
    http.expectOne(URL).flush({
      ...THREAD,
      messages: [
        {
          id: 'm1',
          role: 'user',
          text: 'Who is missing for Benetton?',
          sources: [],
          status: 'complete',
          createdAt: '2026-10-08T08:00:00Z',
        },
      ],
    });
    await settle(fixture);
    const sheet = root.querySelector<HTMLElement>('.match-chat-sheet')!;
    expect(sheet.hasAttribute('data-club')).toBe(true);
    expect(sheet.style.getPropertyValue('--club-banner')).toBe('#001847');
    expect(sheet.querySelector('.scarf')).not.toBeNull();
    const question = sheet.querySelector('.bubble.mine')!;
    expect(question.classList.contains('kit')).toBe(true);
    expect(question.querySelector('img.kit-pattern')?.getAttribute('src')).toBe(
      'assets/images/club-banners/dhl-stormers-pattern.jpeg',
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await settle(fixture);
  });

  it("keeps the Pavilion's teal without a favourite team", async () => {
    const { fixture, host, http } = setup();
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    const launcher = host.querySelector<HTMLButtonElement>('button.launcher')!;
    expect(launcher.classList.contains('club')).toBe(false);
    launcher.click();
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    const sheet = root.querySelector<HTMLElement>('.match-chat-sheet')!;
    expect(sheet.hasAttribute('data-club')).toBe(false);
    expect(sheet.querySelector('.scarf')).toBeNull();
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await settle(fixture);
  });
});
