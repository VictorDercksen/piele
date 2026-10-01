import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatControlService } from '../../../core/league/chat/chat-control.service';
import { ChatStore } from '../../../core/league/chat/chat-store';
import { ChatThread } from '../../../core/league/chat/chat.models';
import { LeagueContext } from '../../../core/league/league-context';
import { MatchChat } from './match-chat';

const URL = `${environment.apiUrl}/v1/leagues/league-1/matches/292605/chat`;

const THREAD: ChatThread = {
  fixtureId: '292605',
  open: true,
  remainingInThread: 5,
  remainingToday: 19,
  messages: [
    {
      id: 'm-1',
      role: 'user',
      text: 'Who is missing for Scarlets?',
      sources: [],
      status: 'complete',
      createdAt: '2026-10-08T08:00:00Z',
    },
    {
      id: 'm-2',
      role: 'assistant',
      text: 'Two props are out [1].',
      sources: [
        { url: 'https://www.unitedrugby.com/news', title: 'Team news' },
        { url: 'https://www.example.org/benetton', title: 'Selection' },
      ],
      status: 'complete',
      createdAt: '2026-10-08T08:00:05Z',
    },
  ],
};

describe('MatchChat', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { configured: true, accessToken: async () => 'token' } },
        { provide: LeagueContext, useValue: { current: signal({ id: 'league-1' }) } },
      ],
    });
    const fixture = TestBed.createComponent(MatchChat);
    fixture.componentRef.setInput('fixtureId', '292605');
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function loaded(thread: ChatThread = THREAD) {
    const context = setup();
    context.http.expectOne(URL).flush(thread);
    await settle(context.fixture);
    return { ...context, element: context.fixture.nativeElement as HTMLElement };
  }

  it('is closed by default, opens, and closes again for another fixture', async () => {
    const { fixture, element, http } = await loaded();
    expect(element.querySelector('h2')?.textContent).toBe('Ask the Pavilion');
    const chevron = element.querySelector<HTMLButtonElement>('.chevron')!;
    const body = element.querySelector<HTMLElement>('.dropdown-body')!;
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    expect(body.hasAttribute('inert')).toBe(true);

    chevron.click();
    await settle(fixture);
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(body.hasAttribute('inert')).toBe(false);

    fixture.componentRef.setInput('fixtureId', '292606');
    fixture.detectChanges();
    http
      .expectOne(URL.replace('292605', '292606'))
      .flush({ ...THREAD, fixtureId: '292606', messages: [] });
    await settle(fixture);
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the thread, the counts and the sources as external links', async () => {
    const { element } = await loaded();
    const bubbles = [...element.querySelectorAll('.thread .bubble')];
    expect(bubbles.map((b) => b.classList.contains('mine'))).toEqual([true, false]);
    expect(bubbles[1].querySelector('.text')?.textContent).toBe('Two props are out [1].');
    expect(bubbles[1].querySelector('.speaker ng-icon')?.getAttribute('name')).toBe('lucideBot');
    const links = [...bubbles[1].querySelectorAll<HTMLAnchorElement>('.sources a')];
    expect(links.map((a) => [a.textContent, a.href])).toEqual([
      ['Team news', 'https://www.unitedrugby.com/news'],
      ['Selection', 'https://www.example.org/benetton'],
    ]);
    expect(links.every((a) => a.rel === 'noopener noreferrer' && a.target === '_blank')).toBe(true);
    expect(element.querySelector('.remaining')?.textContent).toBe(
      '5 of 6 questions left for this match · 19 left today',
    );
  });

  it('renders agent text as text, never markup', async () => {
    const text = '<img src=x onerror=alert(1)><b>bold</b>';
    const { element } = await loaded({
      ...THREAD,
      messages: [{ ...THREAD.messages[1], text }],
    });
    const paragraph = element.querySelector<HTMLElement>('.bubble .text')!;
    expect(paragraph.textContent).toBe(text);
    expect(paragraph.querySelector('img, b')).toBeNull();
  });

  it('invites a first question in an empty thread', async () => {
    const { element } = await loaded({ ...THREAD, messages: [] });
    expect(element.querySelector('.chat-empty')?.textContent).toBe(
      'Ask about the teamsheets, the forecast, the preview or your pick.',
    );
    expect(element.querySelector('textarea')?.getAttribute('maxlength')).toBe('500');
  });

  it('explains when the chat is closed and offers no input', async () => {
    const { element } = await loaded({ ...THREAD, open: false, messages: [] });
    expect(element.querySelector('.chat-empty')?.textContent).toBe(
      'The chat opens three days before kickoff and closes two days after.',
    );
    expect(element.querySelector('textarea')).toBeNull();
  });

  it('disables sending once no questions are left', async () => {
    const { fixture, element } = await loaded({ ...THREAD, remainingInThread: 0 });
    const textarea = element.querySelector('textarea')!;
    textarea.value = 'One more?';
    textarea.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(element.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    expect(element.querySelector('.chat-note')?.textContent).toBe(
      'You have used your questions for this match.',
    );
  });

  it('maps refusals to short sentences', async () => {
    const { fixture, element } = await loaded();
    const store = TestBed.inject(ChatStore);
    const cases: [string, string][] = [
      ['chat_daily_limit', "You have used today's questions for this league."],
      ['chat_busy', 'Your last question is still being answered.'],
      ['chat_capacity', 'The Pavilion is busy; try again later.'],
      ['chat_unavailable', 'The Pavilion could not answer just now.'],
      ['offline', 'The Pavilion could not answer just now.'],
    ];
    for (const [code, sentence] of cases) {
      store.error.set(code);
      await settle(fixture);
      expect(element.querySelector('[role=status]')?.textContent).toBe(sentence);
    }
    store.error.set('chat_closed');
    await settle(fixture);
    expect(element.querySelector('textarea')).toBeNull();
    expect(element.querySelector('.chat-note')?.textContent).toBe(
      'The chat opens three days before kickoff and closes two days after.',
    );
  });

  it('hides the panel while the chat is switched off', async () => {
    const { fixture, http } = setup();
    http
      .expectOne(URL)
      .flush({ detail: { code: 'chat_off', message: 'Off.' } }, { status: 404, statusText: 'No' });
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).classList.contains('off')).toBe(true);
  });

  it('offers a retry when the thread fails to load', async () => {
    const { fixture, http } = setup();
    http.expectOne(URL).flush('down', { status: 503, statusText: 'Unavailable' });
    await settle(fixture);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'The chat could not be loaded.',
    );
    element.querySelector<HTMLButtonElement>('.chat-empty button')!.click();
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    expect(element.querySelectorAll('.thread .bubble').length).toBe(2);
  });

  it('sends on Enter, and Shift+Enter is a new line', async () => {
    const { fixture, element } = await loaded();
    const send = vi.spyOn(TestBed.inject(ChatControlService), 'send').mockResolvedValue();
    const textarea = element.querySelector('textarea')!;
    textarea.value = 'And the weather?';
    textarea.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(element.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);

    const shifted = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      cancelable: true,
    });
    textarea.dispatchEvent(shifted);
    expect(shifted.defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    textarea.dispatchEvent(enter);
    await settle(fixture);
    expect(enter.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledWith('292605', 'And the weather?');
    expect(textarea.value).toBe('');
  });
});
