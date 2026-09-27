import { TestBed } from '@angular/core/testing';
import { AlertService } from '../alert.service';
import { LayoutInsets } from '../layout-insets';
import { AlertSnack } from './alert-snack';

describe('AlertSnack', () => {
  let alerts: AlertService;

  beforeEach(() => {
    vi.useFakeTimers();
    alerts = TestBed.inject(AlertService);
  });
  afterEach(() => {
    alerts.clear();
    vi.useRealTimers();
  });

  async function render() {
    // Rendered by hand: the zoneless scheduler's own timers are faked here.
    const fixture = TestBed.createComponent(AlertSnack);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => fixture.detectChanges();
    const cards = () => Array.from(root.querySelectorAll<HTMLElement>('.card'));
    return { fixture, root, settle, cards };
  }

  it('draws each severity as its card with a role and the severity in words', async () => {
    const { settle, cards } = await render();
    alerts.error('Upload failed.');
    alerts.warn('Name is missing.');
    alerts.success('Saved.');
    await settle();
    expect(cards().map((card) => card.getAttribute('role'))).toEqual(['alert', 'status', 'status']);
    expect(cards().map((card) => card.getAttribute('aria-live'))).toEqual([
      'assertive',
      'polite',
      'polite',
    ]);
    expect(cards().map((card) => card.querySelector('.eyebrow')?.textContent)).toEqual([
      'Red card',
      'Yellow card',
      'Try',
    ]);
    expect(cards().map((card) => card.classList.contains('error'))).toEqual([true, false, false]);
    expect(cards()[2].querySelector('.message')?.textContent).toBe('Saved.');
    alerts.info('The rules are unchanged.');
    await settle();
    expect(cards().at(-1)?.querySelector('.eyebrow')?.textContent).toBe('Referee');
    expect(cards().at(-1)?.classList.contains('info')).toBe(true);
  });

  it('lists details under the message', async () => {
    const { settle, cards } = await render();
    alerts.warn('Name is missing.', { details: ['Pick a team.', 'and 2 more.'] });
    await settle();
    const items = cards()[0].querySelectorAll('.details li');
    expect(Array.from(items).map((item) => item.textContent)).toEqual([
      'Pick a team.',
      'and 2 more.',
    ]);
    alerts.success('Saved.');
    await settle();
    expect(cards()[1].querySelector('.details')).toBeNull();
    expect(cards()[1].querySelector('.action')).toBeNull();
  });

  it('runs the action, then dismisses the card', async () => {
    const { settle, cards } = await render();
    const run = vi.fn();
    alerts.error('The league could not load.', { action: { label: 'Retry', run } });
    await settle();
    const action = cards()[0].querySelector<HTMLButtonElement>('button.action')!;
    expect(action.textContent?.trim()).toBe('Retry');
    action.click();
    await settle();
    expect(run).toHaveBeenCalledOnce();
    expect(alerts.alerts()).toEqual([]);
    expect(cards()).toHaveLength(0);
  });

  it('dismisses a card from its named button', async () => {
    const { settle, cards } = await render();
    alerts.error('First.');
    alerts.error('Second.');
    await settle();
    const dismiss = cards()[0].querySelector<HTMLButtonElement>('button.dismiss')!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss');
    expect(dismiss.querySelector('app-icon')).toBeTruthy();
    dismiss.click();
    await settle();
    expect(alerts.alerts().map((alert) => alert.message)).toEqual(['Second.']);
    expect(cards()).toHaveLength(1);
  });

  it('stops a card’s clock while the pointer or focus is on it', async () => {
    const { settle, cards } = await render();
    alerts.success('Saved.');
    await settle();
    const card = cards()[0];
    vi.advanceTimersByTime(3000);
    card.dispatchEvent(new MouseEvent('mouseenter'));
    card.dispatchEvent(new FocusEvent('focusin'));
    vi.advanceTimersByTime(10_000);
    expect(alerts.alerts()).toHaveLength(1);
    card.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(10_000);
    expect(alerts.alerts()).toHaveLength(1);
    // Focus moving within the card keeps the hold.
    const button = card.querySelector('button')!;
    card.dispatchEvent(new FocusEvent('focusout', { relatedTarget: button }));
    vi.advanceTimersByTime(10_000);
    expect(alerts.alerts()).toHaveLength(1);
    card.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null }));
    vi.advanceTimersByTime(1999);
    expect(alerts.alerts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(alerts.alerts()).toHaveLength(0);
  });

  it('sits clear of the mobile navigation', async () => {
    const { root, settle } = await render();
    const stack = root.querySelector<HTMLElement>('.snack')!;
    expect(stack.getAttribute('popover')).toBe('manual');
    expect(stack.style.getPropertyValue('--snack-inset')).toBe('0px');
    TestBed.inject(LayoutInsets).bottom.set(72);
    await settle();
    expect(stack.style.getPropertyValue('--snack-inset')).toBe('72px');
  });

  it('falls back to a fixed block without the Popover API and empties when cleared', async () => {
    const { root, settle } = await render();
    const stack = root.querySelector<HTMLElement>('.snack')!;
    alerts.info('Note.');
    await settle();
    expect(stack.classList.contains('fallback')).toBe(true);
    alerts.clear();
    await settle();
    expect(stack.classList.contains('fallback')).toBe(false);
    expect(root.querySelectorAll('.card')).toHaveLength(0);
  });
});
