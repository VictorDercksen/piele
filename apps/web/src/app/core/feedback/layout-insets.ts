import { Injectable, signal } from '@angular/core';

/**
 * Space the page's fixed chrome takes from the viewport's edges, in px, so overlays outside
 * the shell (the alert cards) can sit clear of it. The shell writes the mobile navigation's
 * height into `bottom` and returns it to 0 when it leaves.
 */
@Injectable({ providedIn: 'root' })
export class LayoutInsets {
  readonly bottom = signal(0);
}
