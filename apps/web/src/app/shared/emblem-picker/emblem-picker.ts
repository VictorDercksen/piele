import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DEFAULT_ACCENT, EMBLEM_LABELS, EMBLEM_PRESETS, emblemAsset } from '../../core/league/emblems';

let nextId = 0;

/**
 * The preset crests as radio tiles, tinted with the accent colour. The captain's appearance
 * card and the management centre's new-league form both use it; the parent keeps the choice.
 */
@Component({
  selector: 'app-emblem-picker',
  template: `
    <fieldset class="presets">
      <legend>{{ legend() }}</legend>
      <div class="preset-grid">
        @for (preset of presets; track preset.key) {
          <label class="preset" [style.color]="accent() || defaultAccent">
            <input
              type="radio"
              [name]="name"
              [value]="preset.key"
              [checked]="selected() === preset.key"
              [disabled]="disabled()"
              (change)="chosen.emit(preset.key)"
            />
            <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false">
              <use [attr.href]="preset.asset" />
            </svg>
            <span>{{ preset.label }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styleUrl: './emblem-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmblemPicker {
  /** The chosen preset's key, or null for none. */
  readonly selected = input<string | null>(null);
  /** The accent colour that tints the tiles; the brass default without one. */
  readonly accent = input<string | null>(null);
  readonly disabled = input(false);
  readonly legend = input('Preset crests');
  readonly chosen = output<string>();
  readonly name = `emblem-preset-${nextId++}`;
  readonly defaultAccent = DEFAULT_ACCENT;
  readonly presets = EMBLEM_PRESETS.map((key) => ({
    key,
    label: EMBLEM_LABELS[key],
    asset: `${emblemAsset(key)}#emblem`,
  }));
}
