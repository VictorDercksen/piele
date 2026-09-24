import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, map, take } from 'rxjs';

@Component({
  selector: 'app-root',
  // The boot classes are styled in index.html, which shows the same screen before Angular starts.
  template: `@if (booting()) {
      <div class="boot" role="status" aria-label="Loading Piele">
        <div class="boot-stage" aria-hidden="true">
          <span class="boot-shadow"></span>
          <span class="boot-hop">
            <img class="boot-ball" src="assets/images/urc-ball.webp" alt="" />
          </span>
        </div>
        <div class="boot-copy" aria-hidden="true">
          <span class="boot-kicker">Kick-off</span>
          <span class="boot-wordmark">PIELE</span>
          <span class="boot-status">
            @for (phrase of bootPhrases; track phrase) {
              <span>{{ phrase }}</span>
            }
          </span>
        </div>
      </div>
    }
    <router-outlet />`,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
})
export class App {
  readonly bootPhrases = [
    'Checking the team sheet',
    'Chalking the lines',
    'Pumping up the balls',
    'Finding the kicking tee',
  ] as const;

  /** True until the first page and its lazy code have loaded. Continues the index.html loader. */
  readonly booting = toSignal(
    inject(Router).events.pipe(
      filter(
        (event) =>
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError,
      ),
      take(1),
      map(() => false),
    ),
    { initialValue: true },
  );
}
