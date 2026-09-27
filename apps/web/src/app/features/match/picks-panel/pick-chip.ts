import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A two-part pick chip: the picked club's colour block with its short name, then the margin
 * in tabular numerals; a neutral "Draw" chip; a dashed "No pick" chip for a missed pick. A
 * Superbru default pick carries a small "default" tag.
 */
@Component({
  selector: 'app-pick-chip',
  template: `
    @let c = chip();
    @switch (c.kind) {
      @case ('club') {
        <span class="chip club" [style.--club]="c.colour" [style.--club-accent]="c.accent"
          ><span class="club-name">{{ c.label }}</span
          ><span class="margin"><span class="visually-hidden"> by </span>{{ c.margin }}</span></span
        >
      }
      @case ('draw') {
        <span class="chip draw">Draw</span>
      }
      @default {
        <span class="chip missed">No pick</span>
      }
    }
    @if (c.isDefault) {
      <small class="default-tag">default</small>
    }
  `,
  styleUrl: './pick-chip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PickChip {
  readonly chip = input.required<PickChipView>();
}

/** A pick chip: the club block and margin, a draw, or no pick. */
export interface PickChipView {
  readonly kind: 'club' | 'draw' | 'missed';
  readonly label: string;
  readonly margin: number | null;
  readonly colour: string | null;
  readonly accent: string | null;
  readonly isDefault: boolean;
}
