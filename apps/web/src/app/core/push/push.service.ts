import { Service, computed, inject } from '@angular/core';
import { LeagueContext } from '../league/league-context';
import { PushClient } from './push-client';
import { PushCategory, PushState } from './push.models';

/** Push notifications on this device and the current league's muted kinds. */
@Service()
export class PushService {
  private readonly client = inject(PushClient);
  private readonly context = inject(LeagueContext);

  readonly state = computed<PushState>(() => {
    if (!this.client.configured) return 'unconfigured';
    if (this.client.needsInstall) return 'install';
    if (!this.client.supported) return 'unsupported';
    if (this.client.permission() === 'denied') return 'denied';
    const subscribed = this.client.subscribed();
    if (subscribed === null) return 'checking';
    return subscribed ? 'on' : 'off';
  });

  /** The admin viewing a league without a membership has no preferences there. */
  readonly canChooseKinds = computed(
    () => this.state() === 'on' && this.context.isMemberOfCurrent(),
  );

  /** The current league's muted kinds, or null until they are loaded for it. */
  readonly muted = computed<readonly PushCategory[] | null>(() => {
    const preferences = this.client.preferences();
    const league = this.context.current();
    return preferences && league && preferences.leagueId === league.id ? preferences.muted : null;
  });

  isOn(category: PushCategory): boolean {
    return !(this.muted() ?? []).includes(category);
  }
}
