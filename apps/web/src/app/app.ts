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
import { Loader } from './shared/loader/loader';

@Component({
  selector: 'app-root',
  template: `@if (booting()) {
      <div class="boot"><app-loader [size]="96" label="Loading Piele" /></div>
    }
    <router-outlet />`,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Loader],
})
export class App {
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
