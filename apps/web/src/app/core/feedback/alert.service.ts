import { Injectable, Signal, signal } from '@angular/core';

export type AlertSeverity = 'error' | 'warning' | 'success' | 'info';

export interface AlertOptions {
  /** Replaces an existing alert with the same key instead of queuing another. */
  key?: string;
  /** Extra lines under the message, e.g. several validation problems. Keep to 3 or fewer. */
  details?: readonly string[];
  /** A button on the card. Runs, then the alert is dismissed. */
  action?: { label: string; run: () => void };
  /** Override the default lifetime in ms; null keeps the card until dismissed. */
  timeout?: number | null;
}

export interface Alert extends Required<Pick<AlertOptions, 'details'>> {
  readonly id: number;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly key: string | null;
  readonly action: AlertOptions['action'] | null;
  /** The resolved lifetime in ms; null stays until dismissed. */
  readonly timeout: number | null;
}

/** At most this many cards show at once; a newer one drops the oldest. */
export const MAX_VISIBLE = 3;

/** Errors stay until dismissed or replaced; the rest leave on their own. */
export const DEFAULT_TIMEOUTS: Readonly<Record<AlertSeverity, number | null>> = {
  error: null,
  warning: 8000,
  success: 5000,
  info: 5000,
};

/**
 * The app's notices: problems with inputs, uploads, saves and the network, and the outcome of
 * an action. `AlertSnack` draws them as referee's cards above everything, dialogs included.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly list = signal<readonly Alert[]>([]);
  private readonly timers = new Map<number, AlertTimer>();
  private nextId = 1;

  /** Oldest first, at most `MAX_VISIBLE`. */
  readonly alerts: Signal<readonly Alert[]> = this.list.asReadonly();

  show(severity: AlertSeverity, message: string, options: AlertOptions = {}): number {
    const alert: Alert = {
      id: this.nextId++,
      severity,
      message,
      key: options.key ?? null,
      details: options.details ?? [],
      action: options.action ?? null,
      timeout: options.timeout === undefined ? DEFAULT_TIMEOUTS[severity] : options.timeout,
    };
    // A keyed alert replaces its predecessor, and an equal card shown again replaces the one
    // showing (restarting its time) rather than stacking a copy. The replacement is the newest.
    const replaced = this.list().filter(
      (existing) =>
        (alert.key !== null && existing.key === alert.key) ||
        (existing.severity === severity && existing.message === message),
    );
    replaced.forEach((existing) => this.stopTimer(existing.id));
    const kept = this.list().filter((existing) => !replaced.includes(existing));
    const next = [...kept, alert];
    const dropped = next.slice(0, Math.max(0, next.length - MAX_VISIBLE));
    dropped.forEach((existing) => this.stopTimer(existing.id));
    this.list.set(next.slice(dropped.length));
    if (alert.timeout !== null) {
      this.timers.set(alert.id, { handle: null, remaining: alert.timeout, startedAt: 0 });
      this.resume(alert.id);
    }
    return alert.id;
  }

  error(message: string, options?: AlertOptions): number {
    return this.show('error', message, options);
  }

  warn(message: string, options?: AlertOptions): number {
    return this.show('warning', message, options);
  }

  success(message: string, options?: AlertOptions): number {
    return this.show('success', message, options);
  }

  info(message: string, options?: AlertOptions): number {
    return this.show('info', message, options);
  }

  dismiss(id: number): void {
    this.stopTimer(id);
    this.list.update((alerts) => alerts.filter((alert) => alert.id !== id));
  }

  dismissKey(key: string): void {
    this.list()
      .filter((alert) => alert.key === key)
      .forEach((alert) => this.dismiss(alert.id));
  }

  clear(): void {
    [...this.timers.keys()].forEach((id) => this.stopTimer(id));
    this.list.set([]);
  }

  /** Stops an alert's clock, keeping the time it has left. */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) return;
    clearTimeout(timer.handle);
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
    timer.handle = null;
  }

  /** Restarts a paused alert's clock with the time it had left. */
  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  private stopTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle != null) clearTimeout(timer.handle);
    this.timers.delete(id);
  }
}

interface AlertTimer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}
