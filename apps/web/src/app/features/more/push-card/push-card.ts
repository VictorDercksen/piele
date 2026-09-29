import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSwitch } from '@spartan-ng/helm/switch';
import { toApiError } from '../../../core/api/api-error';
import { AlertService } from '../../../core/feedback/alert.service';
import { LeagueContext } from '../../../core/league/league-context';
import { PushControlService } from '../../../core/push/push-control.service';
import { PUSH_CATEGORIES, PushCategory, PushState } from '../../../core/push/push.models';
import { PushService } from '../../../core/push/push.service';
import { Icon } from '../../../shared/icon/icon';
import { Loader } from '../../../shared/loader/loader';

/** The key of this card's alerts, so a new attempt replaces the last one's. */
const ALERT_KEY = 'push-card';

const SUMMARIES: Record<PushState, string> = {
  unconfigured: 'Push notifications are not available in this build.',
  install: 'On iPhone and iPad, notifications work in the Home Screen app.',
  unsupported: 'This browser cannot receive push notifications.',
  denied:
    'Notifications are blocked for The Pavilion. Allow them in your browser or phone settings.',
  checking: 'Checking this device…',
  off: 'Get pick reminders, teamsheets, previews, duties and evidence votes on this device.',
  on: 'On for this device.',
};

/** Push notifications for this device, and which kinds this league sends. */
@Component({
  selector: 'app-push-card',
  templateUrl: './push-card.html',
  styleUrl: './push-card.scss',
  /* prettier-ignore */
  imports: [
    Icon,
    Loader,
    HlmButton,
    HlmLabel,
    HlmSwitch,
  ],
})
export class PushCard {
  private readonly push = inject(PushService);
  private readonly control = inject(PushControlService);
  private readonly alerts = inject(AlertService);
  readonly leagueName = inject(LeagueContext).name;
  readonly categories = PUSH_CATEGORIES;
  readonly state = this.push.state;
  readonly canChooseKinds = this.push.canChooseKinds;
  readonly muted = this.push.muted;
  readonly summary = computed(() => {
    const state = this.state();
    return state === 'on'
      ? `On for this device. Choose what ${this.leagueName()} sends.`
      : SUMMARIES[state];
  });
  readonly busy = signal(false);

  constructor() {
    this.control.refresh().catch((error: unknown) => {
      this.alerts.error(`Notifications could not be checked. ${toApiError(error).message}`, {
        key: ALERT_KEY,
      });
    });
    // Once push is on, and again for each league the page shows, load that league's kinds.
    effect(() => {
      if (!this.canChooseKinds() || this.muted() !== null) return;
      untracked(() =>
        this.control.loadKinds().catch((error: unknown) => {
          this.alerts.error(
            `Notification choices could not be loaded. ${toApiError(error).message}`,
            { key: ALERT_KEY },
          );
        }),
      );
    });
  }

  isOn(category: PushCategory): boolean {
    return this.push.isOn(category);
  }

  async turnOn(): Promise<void> {
    this.busy.set(true);
    try {
      const granted = await this.control.turnOn();
      if (granted) this.alerts.success('Notifications are on for this device.', { key: ALERT_KEY });
      else
        this.alerts.warn('Notifications stay off: this device did not allow them.', {
          key: ALERT_KEY,
        });
    } catch (error) {
      this.alerts.error(`Notifications could not be turned on. ${toApiError(error).message}`, {
        key: ALERT_KEY,
      });
    } finally {
      this.busy.set(false);
    }
  }

  async turnOff(): Promise<void> {
    this.busy.set(true);
    try {
      await this.control.turnOff();
      this.alerts.success('Notifications are off for this device.', { key: ALERT_KEY });
    } catch (error) {
      this.alerts.error(`Notifications could not be turned off. ${toApiError(error).message}`, {
        key: ALERT_KEY,
      });
    } finally {
      this.busy.set(false);
    }
  }

  async setKind(category: PushCategory, on: boolean): Promise<void> {
    try {
      await this.control.setKind(category, on);
      this.alerts.dismissKey(ALERT_KEY);
    } catch (error) {
      this.alerts.error(`That change was not saved. ${toApiError(error).message}`, {
        key: ALERT_KEY,
      });
    }
  }
}
