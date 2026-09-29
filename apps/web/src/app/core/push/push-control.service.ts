import { Service, inject } from '@angular/core';
import { LeagueContext } from '../league/league-context';
import { PushClient } from './push-client';
import { PUSH_CATEGORIES, PushCategory } from './push.models';
import { PushService } from './push.service';

/** Turns push on or off for this device and chooses the current league's kinds. */
@Service()
export class PushControlService {
  private readonly client = inject(PushClient);
  private readonly context = inject(LeagueContext);
  private readonly push = inject(PushService);

  /** Reads the permission and this browser's subscription. */
  refresh(): Promise<void> {
    return this.client.refresh();
  }

  /** Resolves false when the browser's permission was not given. */
  async turnOn(): Promise<boolean> {
    await this.client.subscribe();
    return this.client.permission() === 'granted';
  }

  turnOff(): Promise<void> {
    return this.client.unsubscribe();
  }

  async setKind(category: PushCategory, on: boolean): Promise<void> {
    const league = this.context.current();
    if (!league) return;
    const muted = new Set(this.push.muted() ?? []);
    if (on) muted.delete(category);
    else muted.add(category);
    await this.client.savePreferences(
      league.id,
      PUSH_CATEGORIES.map((option) => option.key).filter((key) => muted.has(key)),
    );
  }

  /** Loads the current league's kinds when push is on and they are not loaded for it yet. */
  async loadKinds(): Promise<void> {
    const league = this.context.current();
    if (league && this.push.canChooseKinds() && this.push.muted() === null)
      await this.client.loadPreferences(league.id);
  }
}
