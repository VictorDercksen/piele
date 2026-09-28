import { Injectable, inject } from '@angular/core';
import { AlertService } from '../feedback/alert.service';

export const BREAKDOWN_STORAGE_KEY = 'pavilion-standings-breakdown-v1';
const ALERT_KEY = 'standings-preferences';

/** Browser persistence for the standings breakdown, with visible failure feedback. */
@Injectable({ providedIn: 'root' })
export class StandingsPreferences {
  private readonly alerts = inject(AlertService);

  readBreakdown(): boolean {
    try {
      return localStorage.getItem(BREAKDOWN_STORAGE_KEY) === '1';
    } catch {
      this.alerts.error('Your browser could not read your standings preferences.', {
        key: ALERT_KEY,
      });
      return false;
    }
  }

  saveBreakdown(show: boolean): void {
    try {
      localStorage.setItem(BREAKDOWN_STORAGE_KEY, show ? '1' : '0');
      this.alerts.dismissKey(ALERT_KEY);
    } catch {
      this.alerts.error(
        'Your browser could not save your standings preferences. This choice lasts only for this visit.',
        { key: ALERT_KEY },
      );
    }
  }
}
