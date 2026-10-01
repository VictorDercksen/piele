import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Chat } from '@ai-sdk/angular';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatControlService } from '../../../core/league/chat/chat-control.service';
import { ChatStore } from '../../../core/league/chat/chat-store';
import { ChatThread } from '../../../core/league/chat/chat.models';
import { LeagueContext } from '../../../core/league/league-context';
import { MatchChatSheet } from './match-chat-sheet';

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

const EMPTY: ChatThread = { ...THREAD, messages: [] };

describe('MatchChatSheet', () => {
  const root = document.body;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { configured: true, accessToken: async () => 'token' } },
        { provide: LeagueContext, useValue: { current: signal({ id: 'league-1' }) } },
      ],
    });
    const fixture = TestBed.createComponent(MatchChatSheet);
    fixture.componentRef.setInput('fixtureId', '292605');
    fixture.componentRef.setInput('home', 'Scarlets');
    fixture.componentRef.setInput('away', 'Benetton');
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  async function settle(fixture: ComponentFixture<unknown>) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the sheet on a thread read from the API. */
  async function opened(thread: ChatThread = THREAD) {
    const context = setup();
    context.fixture.componentInstance.open();
    context.http.expectOne(URL).flush(thread);
    await settle(context.fixture);
    return context;
  }

  const dialog = () => root.querySelector<HTMLElement>('[role=dialog]');
  const sheet = () => root.querySelector<HTMLElement>('.match-chat-sheet');
  const field = () => root.querySelector<HTMLInputElement>('#match-chat-question');
  const sendButton = () => root.querySelector<HTMLButtonElement>('.ask button.send');

  it('is a labelled modal dialog naming the fixture, with focus in the question field', async () => {
    const { fixture } = await opened();
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(dialog()?.getAttribute('aria-labelledby')).toBe('match-chat-title');
    expect(root.querySelector('#match-chat-title')?.textContent).toBe('The Pavilion');
    expect(sheet()?.querySelector('.fixture-line')?.textContent).toBe('Scarlets v Benetton');
    expect(sheet()?.querySelector('.intro')?.textContent).toBe(
      'Ask about the teamsheets, the forecast, the preview or your pick. Answers cite their sources.',
    );
    await settle(fixture);
    expect(document.activeElement).toBe(field());
    expect(field()?.getAttribute('maxlength')).toBe('500');
    expect(field()?.placeholder).toBe('Ask about this match');

    root.querySelector<HTMLButtonElement>('.sheet-head .close')!.click();
    await settle(fixture);
    expect(dialog()).toBeNull();
  });

  it('offers ready questions in an empty thread and sends the one tapped', async () => {
    const { fixture } = await opened(EMPTY);
    const send = vi.spyOn(TestBed.inject(ChatControlService), 'send').mockResolvedValue();
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.chips button')];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      'Who is missing for Scarlets?',
      'Who is missing for Benetton?',
      'What is the forecast at kickoff?',
      'Summarise the preview',
    ]);
    chips[1].click();
    await settle(fixture);
    expect(send).toHaveBeenCalledWith('292605', 'Who is missing for Benetton?');
  });

  it('shows the thread, the counts and the sources as external links, without chips', async () => {
    await opened();
    expect(root.querySelector('.chips')).toBeNull();
    const log = root.querySelector('[role=log]')!;
    const bubbles = [...log.querySelectorAll('.bubble')];
    expect(bubbles.map((b) => b.classList.contains('mine'))).toEqual([true, false]);
    expect(bubbles[1].querySelector('.text')?.textContent).toBe('Two props are out [1].');
    expect(bubbles[1].querySelector('.speaker ng-icon')?.getAttribute('name')).toBe('lucideBot');
    const links = [...bubbles[1].querySelectorAll<HTMLAnchorElement>('.sources a')];
    expect(links.map((a) => [a.textContent, a.href])).toEqual([
      ['Team news', 'https://www.unitedrugby.com/news'],
      ['Selection', 'https://www.example.org/benetton'],
    ]);
    expect(links.every((a) => a.rel === 'noopener noreferrer' && a.target === '_blank')).toBe(true);
    expect(links[0].querySelector('ng-icon')?.getAttribute('name')).toBe('lucideExternalLink');
    expect(root.querySelector('.remaining')?.textContent).toBe(
      '5 of 6 questions left for this match · 19 left today',
    );
    expect(root.querySelector('.foot .clear')?.textContent?.trim()).toBe('Clear');
  });

  it('renders agent text as text, never markup', async () => {
    const text = '<img src=x onerror=alert(1)><b>bold</b>';
    await opened({ ...THREAD, messages: [{ ...THREAD.messages[1], text }] });
    const paragraph = root.querySelector<HTMLElement>('.bubble .text')!;
    expect(paragraph.textContent).toBe(text);
    expect(paragraph.querySelector('img, b')).toBeNull();
  });

  it('sends the typed question from the form and empties the field', async () => {
    const { fixture } = await opened();
    const send = vi.spyOn(TestBed.inject(ChatControlService), 'send').mockResolvedValue();
    expect(sendButton()!.disabled).toBe(true);
    field()!.value = 'And the weather?';
    field()!.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(sendButton()!.disabled).toBe(false);
    root.querySelector<HTMLFormElement>('form.ask')!.requestSubmit();
    await settle(fixture);
    expect(send).toHaveBeenCalledWith('292605', 'And the weather?');
    expect(field()!.value).toBe('');
  });

  it('streams the answer with a cursor and turns send into stop', async () => {
    const { fixture } = await opened();
    const stop = vi.spyOn(TestBed.inject(ChatControlService), 'stop').mockResolvedValue();
    const streaming = {
      status: 'streaming',
      messages: [{ id: 'a-1', role: 'assistant', parts: [{ type: 'text', text: 'Rain at' }] }],
    } as unknown as Chat;
    TestBed.inject(ChatStore).chat.set(streaming);
    await settle(fixture);
    const bubble = root.querySelector('.streaming')!;
    expect(bubble.getAttribute('aria-busy')).toBe('true');
    expect(bubble.querySelector('.text')?.textContent).toBe('Rain at');
    expect(bubble.querySelector('.cursor')).not.toBeNull();
    expect(sendButton()!.getAttribute('aria-label')).toBe('Stop the answer');
    expect(root.querySelector<HTMLButtonElement>('.foot .clear')!.disabled).toBe(true);
    sendButton()!.click();
    expect(stop).toHaveBeenCalled();
  });

  it('explains when the chat is closed and offers no chips or field', async () => {
    await opened({ ...EMPTY, open: false });
    expect(root.querySelector('.state')?.textContent).toBe(
      'The chat opens three days before kickoff and closes two days after.',
    );
    expect(root.querySelector('.chips')).toBeNull();
    expect(field()).toBeNull();
  });

  it('disables sending once no questions are left', async () => {
    const { fixture } = await opened({ ...THREAD, remainingInThread: 0 });
    field()!.value = 'One more?';
    field()!.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(sendButton()!.disabled).toBe(true);
    expect(root.querySelector('[role=status]')?.textContent).toBe(
      'You have used your questions for this match.',
    );
  });

  it('maps refusals to a status line above the field', async () => {
    const { fixture } = await opened(EMPTY);
    const store = TestBed.inject(ChatStore);
    const cases: [string, string][] = [
      ['chat_thread_limit', 'You have used your questions for this match.'],
      ['chat_daily_limit', "You have used today's questions for this league."],
      ['chat_busy', 'Your last question is still being answered.'],
      ['chat_capacity', 'The Pavilion is busy; try again later.'],
      ['chat_unavailable', 'The Pavilion could not answer just now.'],
      ['offline', 'The Pavilion could not answer just now.'],
    ];
    for (const [code, sentence] of cases) {
      store.error.set(code);
      await settle(fixture);
      const status = root.querySelector('[role=status]')!;
      expect(status.textContent).toBe(sentence);
      expect(status.nextElementSibling?.matches('form.ask')).toBe(true);
    }
    store.error.set('chat_closed');
    await settle(fixture);
    expect(field()).toBeNull();
    expect(root.querySelector('.state')?.textContent).toBe(
      'The chat opens three days before kickoff and closes two days after.',
    );
  });

  it('says why a non-member cannot ask', async () => {
    const { fixture, http } = setup();
    fixture.componentInstance.open();
    http
      .expectOne(URL)
      .flush(
        { detail: { code: 'not_a_member', message: 'No.' } },
        { status: 403, statusText: 'Forbidden' },
      );
    await settle(fixture);
    expect(root.querySelector('.state')?.textContent).toBe(
      'Only members of this league can ask the Pavilion.',
    );
    expect(field()).toBeNull();
  });

  it('shows loading, then offers a retry when the thread fails to load', async () => {
    const { fixture, http } = setup();
    fixture.componentInstance.open();
    await settle(fixture);
    expect(root.querySelector('.state')?.textContent).toBe('Loading the chat.');
    http.expectOne(URL).flush('down', { status: 503, statusText: 'Unavailable' });
    await settle(fixture);
    expect(root.querySelector('[role=alert]')?.textContent).toContain(
      'The chat could not be loaded.',
    );
    root.querySelector<HTMLButtonElement>('.state button')!.click();
    http.expectOne(URL).flush(THREAD);
    await settle(fixture);
    expect(root.querySelectorAll('[role=log] .bubble').length).toBe(2);
  });

  it('closes on Escape and when the route moves to another fixture', async () => {
    const { fixture } = await opened();
    field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    expect(dialog()).toBeNull();

    fixture.componentInstance.open();
    TestBed.inject(HttpTestingController).expectOne(URL).flush(THREAD);
    await settle(fixture);
    expect(dialog()).not.toBeNull();
    fixture.componentRef.setInput('fixtureId', '292606');
    await settle(fixture);
    expect(dialog()).toBeNull();
  });
});
