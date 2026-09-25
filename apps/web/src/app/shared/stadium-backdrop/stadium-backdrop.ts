import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';

const FALLBACK = 'assets/editorial/match-night-ground.png';

/** Two decoded image layers keep navigation smooth without fading the page content. */
@Component({
  selector: 'app-stadium-backdrop',
  template: `
    @for (source of layers(); track $index) {
      @if (source) {
        <img [src]="source" alt="" [class.visible]="active() === $index" />
      }
    }
  `,
  styleUrl: './stadium-backdrop.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class StadiumBackdrop {
  readonly src = input<string | undefined>();
  readonly layers = signal<readonly (string | null)[]>([null, null]);
  readonly active = signal(0);

  constructor() {
    effect((onCleanup) => {
      const source = this.src() ?? FALLBACK;
      if (untracked(() => this.layers()[this.active()]) === source) return;
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      const show = (url: string) => {
        if (cancelled) return;
        const next = this.active() === 0 ? 1 : 0;
        this.layers.update((layers) =>
          layers.map((layer, index) => (index === next ? url : layer)),
        );
        this.active.set(next);
      };
      const load = async () => {
        try {
          await decode(source);
          show(source);
        } catch {
          if (cancelled || source === FALLBACK) return;
          try {
            await decode(FALLBACK);
            show(FALLBACK);
          } catch {
            // Keep the previous scene, or the solid page colour if no image can load.
          }
        }
      };
      void load();
    });
  }
}

async function decode(source: string): Promise<void> {
  const image = new Image();
  image.src = source;
  await image.decode();
}
