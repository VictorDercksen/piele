import { HttpClient } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { appleMobile, applicationServerKey, pushSupported, standalone } from './push-device';
import { PushCategory, PushPreferences, PushSubscriptionBody } from './push.models';

const WORKER_URL = '/sw.js';

/**
 * This browser's push subscription and the API routes that store it: the transport and
 * device state behind `PushService` (reads) and `PushControlService` (changes). Only builds
 * that talk to the API with sign-in offer push.
 */
@Service()
export class PushClient {
  private readonly http = inject(HttpClient);
  readonly configured =
    !environment.sampleLeagueData && !!environment.apiUrl && !!environment.supabaseUrl;
  readonly supported = pushSupported();
  /** iPhone and iPad offer push only to the Home Screen app. */
  readonly needsInstall = !this.supported && appleMobile() && !standalone();

  private readonly permissionState = signal<NotificationPermission>(
    this.supported ? Notification.permission : 'default',
  );
  readonly permission = this.permissionState.asReadonly();
  /** Whether this browser holds a subscription; null until `refresh` has looked. */
  private readonly subscribedState = signal<boolean | null>(null);
  readonly subscribed = this.subscribedState.asReadonly();
  private readonly preferencesState = signal<PushPreferences | null>(null);
  readonly preferences = this.preferencesState.asReadonly();

  private registration: Promise<ServiceWorkerRegistration> | null = null;

  /** Registers the service worker that shows messages and opens their page. */
  register(): Promise<ServiceWorkerRegistration> | null {
    if (!this.configured || !this.supported) return null;
    this.registration ??= navigator.serviceWorker.register(WORKER_URL, { scope: '/' });
    return this.registration;
  }

  /**
   * Reads the permission and this browser's subscription. A subscription present is stored
   * again for the signed-in account, which keeps the API's copy current.
   */
  async refresh(): Promise<void> {
    const registration = await this.register();
    if (!registration) return;
    this.permissionState.set(Notification.permission);
    const subscription = await registration.pushManager.getSubscription();
    this.subscribedState.set(!!subscription && Notification.permission === 'granted');
    if (subscription && Notification.permission === 'granted') await this.store(subscription);
  }

  /** Asks for permission (from a tap), subscribes this browser and stores it. */
  async subscribe(): Promise<void> {
    const registration = await this.register();
    if (!registration) throw new Error('This browser cannot receive push notifications.');
    const permission = await Notification.requestPermission();
    this.permissionState.set(permission);
    if (permission !== 'granted') return;
    const { publicKey } = await firstValueFrom(
      this.http.get<{ publicKey: string }>(`${environment.apiUrl}/v1/push/key`),
    );
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      }));
    await this.store(subscription);
    this.subscribedState.set(true);
  }

  /** Forgets this browser for the account and ends its subscription. */
  async unsubscribe(): Promise<void> {
    const registration = await this.register();
    const subscription = await registration?.pushManager.getSubscription();
    try {
      if (subscription)
        await firstValueFrom(
          this.http.delete<void>(`${environment.apiUrl}/v1/me/push-subscriptions`, {
            body: { endpoint: subscription.endpoint },
          }),
        );
    } finally {
      // The browser's subscription ends even when the API is unreachable: its endpoint then
      // answers 410 and the job forgets it, so nothing reaches this device afterwards.
      await subscription?.unsubscribe().catch(() => false);
      this.subscribedState.set(false);
    }
  }

  /** On sign-out: the next account on this device starts with push off. Never throws. */
  async forget(): Promise<void> {
    if (!this.configured || !this.supported) return;
    try {
      await this.unsubscribe();
    } catch {
      // Signing out goes ahead; the browser's subscription has ended either way.
    }
    this.preferencesState.set(null);
  }

  async loadPreferences(leagueId: string): Promise<void> {
    const { muted } = await firstValueFrom(
      this.http.get<{ muted: PushCategory[] }>(this.preferencesUrl(leagueId)),
    );
    this.preferencesState.set({ leagueId, muted });
  }

  /** Shows the change at once and restores the previous state when the API refuses it. */
  async savePreferences(leagueId: string, muted: readonly PushCategory[]): Promise<void> {
    const previous = this.preferencesState();
    this.preferencesState.set({ leagueId, muted });
    try {
      const saved = await firstValueFrom(
        this.http.put<{ muted: PushCategory[] }>(this.preferencesUrl(leagueId), { muted }),
      );
      this.preferencesState.set({ leagueId, muted: saved.muted });
    } catch (error) {
      this.preferencesState.set(previous);
      throw error;
    }
  }

  private async store(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const body: PushSubscriptionBody = {
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
    };
    await firstValueFrom(
      this.http.put<void>(`${environment.apiUrl}/v1/me/push-subscriptions`, body),
    );
  }

  private preferencesUrl(leagueId: string): string {
    return `${environment.apiUrl}/v1/leagues/${leagueId}/me/push`;
  }
}
