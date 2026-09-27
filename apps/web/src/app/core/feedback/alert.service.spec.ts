import { TestBed } from '@angular/core/testing';
import { AlertService, MAX_VISIBLE } from './alert.service';

describe('AlertService', () => {
  let alerts: AlertService;
  const messages = () => alerts.alerts().map((alert) => alert.message);

  beforeEach(() => {
    vi.useFakeTimers();
    alerts = TestBed.inject(AlertService);
  });
  afterEach(() => {
    alerts.clear();
    vi.useRealTimers();
  });

  it('queues alerts oldest first and returns their ids', () => {
    const first = alerts.info('One');
    const second = alerts.success('Two');
    expect(second).toBeGreaterThan(first);
    expect(messages()).toEqual(['One', 'Two']);
    expect(alerts.alerts()[1]).toEqual({
      id: second,
      severity: 'success',
      message: 'Two',
      key: null,
      details: [],
      action: null,
      timeout: 5000,
    });
  });

  it(`shows at most ${MAX_VISIBLE}, dropping the oldest and its timer`, () => {
    const dropped = alerts.warn('One');
    ['Two', 'Three', 'Four'].forEach((message) => alerts.error(message));
    expect(messages()).toEqual(['Two', 'Three', 'Four']);
    expect(alerts.alerts().some((alert) => alert.id === dropped)).toBe(false);
    // The dropped warning's timer went with it.
    expect(vi.getTimerCount()).toBe(0);
    alerts.error('Five');
    expect(messages()).toEqual(['Three', 'Four', 'Five']);
  });

  it('replaces an alert with the same key, keeping the newest last', () => {
    const old = alerts.error('Could not load', { key: 'league-load' });
    alerts.info('Other');
    const replacement = alerts.error('Still cannot load', { key: 'league-load' });
    expect(replacement).not.toBe(old);
    expect(messages()).toEqual(['Other', 'Still cannot load']);
    alerts.dismissKey('league-load');
    expect(messages()).toEqual(['Other']);
  });

  it('collapses an equal card shown again and restarts its time', () => {
    alerts.success('Saved.');
    vi.advanceTimersByTime(4000);
    alerts.success('Saved.');
    alerts.warn('Saved.');
    expect(alerts.alerts().map((alert) => alert.severity)).toEqual(['success', 'warning']);
    vi.advanceTimersByTime(4000);
    expect(messages()).toEqual(['Saved.', 'Saved.']);
    vi.advanceTimersByTime(1000);
    expect(alerts.alerts().map((alert) => alert.severity)).toEqual(['warning']);
  });

  it('gives each severity its default lifetime, and errors none', () => {
    alerts.error('Error');
    alerts.warn('Warning');
    alerts.success('Success');
    expect(alerts.alerts().map((alert) => alert.timeout)).toEqual([null, 8000, 5000]);
    vi.advanceTimersByTime(4999);
    expect(messages()).toEqual(['Error', 'Warning', 'Success']);
    vi.advanceTimersByTime(1);
    expect(messages()).toEqual(['Error', 'Warning']);
    alerts.info('Info');
    vi.advanceTimersByTime(3000);
    expect(messages()).toEqual(['Error', 'Info']);
    vi.advanceTimersByTime(2000);
    expect(messages()).toEqual(['Error']);
    vi.advanceTimersByTime(60_000);
    expect(messages()).toEqual(['Error']);
  });

  it('honours an explicit timeout, null keeping any card', () => {
    alerts.success('Kept', { timeout: null });
    alerts.error('Brief', { timeout: 1000 });
    vi.advanceTimersByTime(1000);
    expect(messages()).toEqual(['Kept']);
    vi.advanceTimersByTime(60_000);
    expect(messages()).toEqual(['Kept']);
  });

  it('keeps details and the action', () => {
    const run = vi.fn();
    alerts.warn('Check the form.', {
      details: ['Name is missing.'],
      action: { label: 'Fix', run },
    });
    const [alert] = alerts.alerts();
    expect(alert.details).toEqual(['Name is missing.']);
    expect(alert.action?.label).toBe('Fix');
  });

  it('pauses and resumes with the time that was left', () => {
    const id = alerts.success('Saved.');
    vi.advanceTimersByTime(3000);
    alerts.pause(id);
    vi.advanceTimersByTime(20_000);
    expect(messages()).toEqual(['Saved.']);
    alerts.resume(id);
    vi.advanceTimersByTime(1999);
    expect(messages()).toEqual(['Saved.']);
    vi.advanceTimersByTime(1);
    expect(messages()).toEqual([]);
  });

  it('ignores pausing an error and a repeated resume', () => {
    const error = alerts.error('Failed.');
    alerts.pause(error);
    alerts.resume(error);
    expect(vi.getTimerCount()).toBe(0);
    const id = alerts.info('Note.');
    alerts.resume(id);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('cancels timers on dismiss and clear', () => {
    const id = alerts.success('One');
    alerts.warn('Two');
    alerts.dismiss(id);
    expect(messages()).toEqual(['Two']);
    expect(vi.getTimerCount()).toBe(1);
    alerts.clear();
    expect(messages()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
