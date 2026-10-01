import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatThread } from '../../../core/league/chat/chat.models';
import { LeagueContext } from '../../../core/league/league-context';
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

  function setup(league: { id: string } | null = { id: 'league-1' }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { configured: true, accessToken: async () => 'token' } },
        { provide: LeagueContext, useValue: { current: signal(league) } },
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
});
