import { HlmToggleGroup } from '@spartan-ng/helm/toggle-group';
import { HlmToggleGroupItem } from '@spartan-ng/helm/toggle-group';
import { HlmButton } from '@spartan-ng/helm/button';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { BADGES } from '../../core/league/badges';
import { StandingsPreferences } from '../../core/storage/standings-preferences';
import { MemberAvatar } from '../member-avatar/member-avatar';
import { BreakdownPart, PointsRow, PointsScope } from './points-table.models';
import { BREAKDOWN_PARTS, LABEL_MIN_WIDTH, breakdownPartFrom } from './points-table.rows';

/**
 * The round or season Superbru table with the Totals / Breakdown switch and its key, as the
 * standings page and the home board draw it. With a `limit`, only the top rows show, plus the
 * member's own row pinned beneath them when it falls below.
 */
@Component({
  selector: 'app-points-table',
  templateUrl: './points-table.html',
  styleUrl: './points-table.scss',
  // prettier-ignore
  imports: [
    DecimalPipe,
    MemberAvatar,
    HlmButton,
    HlmToggleGroup,
    HlmToggleGroupItem,
  ],
})
export class PointsTable {
  private readonly preferences = inject(StandingsPreferences);
  readonly rows = input.required<readonly PointsRow[]>();
  readonly scope = input.required<PointsScope>();
  /** How many top rows show; all when null. */
  readonly limit = input<number | null>(null);
  readonly badges = BADGES;
  readonly parts = BREAKDOWN_PARTS;
  readonly labelMin = LABEL_MIN_WIDTH;
  /** Whether the WP, MP, GSP and BP bars show; remembered in this browser. */
  readonly breakdown = signal(this.preferences.readBreakdown());
  /** The part the key highlights across the bars, or none. */
  readonly highlight = signal<BreakdownPart | null>(null);
  /** The rows drawn, each marked `pinned` when it is the member's own row below the limit. */
  readonly shown = computed(() => {
    const rows = this.rows();
    const limit = this.limit();
    if (limit === null || rows.length <= limit) return rows.map((row) => ({ row, pinned: false }));
    const top = rows.slice(0, limit).map((row) => ({ row, pinned: false }));
    const you = rows.slice(limit).find((row) => row.you);
    return you ? [...top, { row: you, pinned: true }] : top;
  });

  /** Shows the totals or the breakdown, and remembers the choice in this browser. */
  setBreakdown(view: unknown): void {
    const next = view === 'breakdown';
    if (next === this.breakdown()) return;
    this.breakdown.set(next);
    this.highlight.set(null);
    this.preferences.saveBreakdown(next);
  }

  setHighlight(part: unknown): void {
    this.highlight.set(breakdownPartFrom(part));
  }
}
