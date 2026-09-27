import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideLock, lucidePencil } from '@ng-icons/lucide';
import { map } from 'rxjs';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { LeagueTimePipe } from '../../../core/competition/league-time.pipe';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { ApiError } from '../../../core/league/http-league-data';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { MemberPick, NewPick } from '../../../core/league/league.models';
import { PickRowView, RoundViewService } from '../../../core/league/round-view.service';
import { roundType, sameTotal } from '../../../core/league/superbru';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { MemberAvatar } from '../../../shared/member-avatar/member-avatar';
import { PickChip, PickChipView } from './pick-chip';

/** The widest margin the scale reaches; beyond it the marker sits at the end. */
export const SCALE_REACH = 40;

/** A typed margin as a number, or null unless it is digits from 1 to 150. */
export function parseMargin(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const margin = Number(trimmed);
  return margin >= 1 && margin <= 150 ? margin : null;
}

/** A margin from 1 to 150, typed as digits. */
function marginValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (!value) return null;
  return parseMargin(value) === null ? { margin: true } : null;
}

/**
 * The match centre's "Pool picks." panel. Before kickoff a member without a pick sees only
 * their own pick form: the margin scale, a strip in the scoring panel's shape with a crest at
 * each end and a range between them, where the marker's distance from the middle is the margin
 * toward that side and the middle is a draw (`slide`, `nudge` from either crest, `pickDraw`,
 * and the typed margin, all writing the same two form controls). Once their pick is in they see
 * the pool's split and their own pick, and can edit theirs until kickoff. After kickoff their line carries their points and place. The
 * pool table itself (every pick with its outcome, margin and bonus marks and points, as the
 * view scores them) is the body of the panel's dropdown (`#picks-pool`), closed by default and
 * for every new fixture; the form, split and pick above it are the dropdown's lead. The admin
 * viewing a league it is not in sees the pool without a form.
 */
@Component({
  selector: 'app-picks-panel',
  templateUrl: './picks-panel.html',
  styleUrl: './picks-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    Dropdown,
    ReactiveFormsModule,
    RouterLink,
    LeaguePathPipe,
    LeagueTimePipe,
    MemberAvatar,
    NgIcon,
    PickChip,
  ],
  viewProviders: [provideIcons({ lucideArrowRight, lucideLock, lucidePencil })],
})
export class PicksPanel {
  private readonly alerts = inject(AlertService);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  private readonly injector = inject(Injector);
  protected readonly view = inject(RoundViewService);
  /** The display zone for the kickoff. */
  protected readonly zone = this.time.zone;

  readonly fixtureId = input.required<string>();

  /** The fixture's picks as the view gives them. */
  readonly picks = computed(() => this.view.picksFor(this.fixtureId()));
  /** The member reopened the form to change a pick that is in. */
  readonly editing = linkedSignal({ source: this.fixtureId, computation: () => false });
  readonly submitted = signal(false);
  readonly saving = signal(false);
  /** The key of this fixture's warning card; a new attempt replaces it. */
  readonly warningKey = computed(() => `pick-${this.fixtureId()}`);
  /** The key of this fixture's failure card; a retry replaces it and a save clears it. */
  readonly failureKey = computed(() => `pick-failed-${this.fixtureId()}`);
  /** The chip for a member with no pick after kickoff. */
  protected readonly noPick: PickChipView = {
    kind: 'missed',
    label: 'No pick',
    margin: null,
    colour: null,
    accent: null,
    isDefault: false,
  };

  readonly form = new FormGroup({
    side: new FormControl<PickChoice | null>(null, { validators: Validators.required }),
    margin: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, marginValidator],
    }),
  });
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  private readonly scaleInput = viewChild<ElementRef<HTMLInputElement>>('scaleInput');
  private readonly scaleStrip = viewChild<ElementRef<HTMLElement>>('scaleStrip');
  private readonly marginInput = viewChild<ElementRef<HTMLInputElement>>('marginInput');
  private readonly mineStrip = viewChild<ElementRef<HTMLElement>>('mineStrip');

  /** How far the scale runs each way; the template draws its ticks from it. */
  protected readonly reach = SCALE_REACH;

  /**
   * The scale as drawn from the form: the range's value (home is left, so negative), the marker's
   * position and label, the fill from the middle, and the pick in words for the range's
   * `aria-valuetext`.
   */
  readonly scale = computed<ScaleView>(() => {
    this.status();
    const { side, margin } = this.value();
    const sides = this.sides();
    const parsed = parseMargin(margin);
    const club = side === 'home' || side === 'away' ? side : null;
    const name = club ? (sides?.[club].name ?? (club === 'home' ? 'Home' : 'Away')) : '';
    const reach = club && parsed !== null ? Math.min(parsed, SCALE_REACH) : 0;
    const range = club === 'home' ? -reach : reach;
    const pct = 50 + (range * 50) / SCALE_REACH;
    return {
      side,
      range,
      pct,
      fillLeft: club === 'home' ? pct : 50,
      fillRight: club === 'away' ? 100 - pct : 50,
      thumb:
        side === null ? 'Pick' : side === 'draw' ? 'Draw' : parsed === null ? '?' : String(parsed),
      text:
        side === null
          ? 'No pick yet'
          : side === 'draw'
            ? 'A draw'
            : parsed === null
              ? `${name}, no margin yet`
              : `${name} by ${parsed}`,
    };
  });

  /**
   * Which side of the Draw chip the margin field sits: the chosen club's, and the last club's
   * while a draw is chosen or nothing is yet.
   */
  readonly marginSlot = signal<'home' | 'away'>('home');

  /** The member's own form: before kickoff, for a member, until the pick is in or while editing. */
  readonly showForm = computed(() => {
    const picks = this.picks();
    return (
      !!picks && !picks.locked && !this.view.adminView() && (!picks.recorded || this.editing())
    );
  });
  /** The pool's picks show once the member's pick is in, after kickoff, or for the admin. */
  readonly showPool = computed(() => {
    const picks = this.picks();
    return !!picks && !picks.hidden;
  });
  readonly tag = computed(() => {
    const picks = this.picks();
    if (!picks || !picks.locked) return 'open';
    if (picks.void) return 'void';
    if (picks.final) return 'final';
    if (picks.provisional) return 'provisional';
    return picks.recorded || this.view.adminView() ? 'locked' : 'awaiting picks';
  });
  /** Scores are in (live or full time): marks and points show. */
  readonly scored = computed(() => {
    const picks = this.picks();
    return !!picks && picks.locked && !picks.void && (picks.provisional || picks.final);
  });

  /** Each side's short name, colours, banner crest and jersey. */
  readonly sides = computed(() => {
    const picks = this.picks();
    if (!picks) return null;
    const competition = this.competition.current();
    const side = (id: string, name: string): SideLook => {
      const team = competition.team(id);
      const banner = competition.banners[id];
      return {
        name: team?.shortName ?? name,
        colour: team?.colour ?? banner?.colour ?? null,
        accent: team?.accent ?? null,
        banner: banner?.colour ?? team?.colour ?? null,
        crest: banner?.crest ?? null,
        jersey: competition.jersey(id),
      };
    };
    return {
      home: side(picks.fixture.homeAsset, picks.fixture.home),
      away: side(picks.fixture.awayAsset, picks.fixture.away),
    };
  });

  /** How the pool leans, once anyone has a side or a draw in. */
  readonly sway = computed(() => {
    const picks = this.picks();
    const sides = this.sides();
    if (!picks || !sides || !picks.rows.some((r) => r.side !== 'missed')) return null;
    const { home, draw, away } = picks.sway;
    const parts = [`${sides.home.name} ${home}%`];
    if (draw) parts.push(`draw ${draw}%`);
    parts.push(`${sides.away.name} ${away}%`);
    return { home, draw, away, label: `The pool's split: ${parts.join(', ')}.` };
  });

  /** The pool table in the view's order, with each pick's chip and marks. */
  readonly rows = computed<readonly PoolRow[]>(() => {
    const picks = this.picks();
    if (!picks) return [];
    const bonus = this.view.rules().bonusPointValue;
    return picks.rows.map((row) => ({
      row,
      chip: chipOf(row),
      marks: [
        {
          key: 'w',
          earned: row.wp > 0,
          fraction: null,
          text: row.wp > 0 ? 'outcome point' : 'no outcome point',
        },
        {
          key: 'm',
          earned: row.mp > 0,
          fraction: null,
          text: row.mp > 0 ? 'margin point' : 'no margin point',
        },
        {
          key: 'b',
          earned: row.bp > 0,
          fraction: row.bp > 0 && !sameTotal(row.bp, bonus) ? row.bp : null,
          text:
            row.bp > 0
              ? sameTotal(row.bp, bonus)
                ? 'bonus point'
                : `${round(row.bp)} of the bonus point`
              : 'no bonus point',
        },
      ],
    }));
  });

  /** The member's own line: pick chip, points and place. Null for the admin view. */
  readonly mine = computed(() => {
    const picks = this.picks();
    if (!picks || this.view.adminView()) return null;
    const row = picks.rows.find((r) => r.you) ?? null;
    return {
      row,
      chip: row ? chipOf(row) : null,
      place: picks.myPlace === null ? null : `${ordinal(picks.myPlace)} of ${picks.rows.length}`,
    };
  });

  /** Steward: some active member has no pick for a match that has kicked off. */
  readonly missingPicks = computed(() => {
    const picks = this.picks();
    if (!picks?.locked || !this.view.administers()) return false;
    const picked = new Set(picks.rows.filter((r) => r.side !== 'missed').map((r) => r.memberId));
    return this.view.members().some((member) => !picked.has(member.id));
  });

  /** The rules line under the table, from the season's rules and this round's win points. */
  readonly legend = computed(() => {
    const picks = this.picks();
    const rules = this.view.rules();
    const wp = picks ? rules.winPoints[roundType(picks.round.id, this.competition.current())] : 0;
    const parts = [
      'Superbru scoring',
      `Outcome ${round(wp)}`,
      `Within ${rules.marginWindow} ${round(rules.marginPoint)}`,
    ];
    if (rules.bonusPoint) {
      let closest = `Closest ${round(rules.bonusPointValue)}`;
      if (rules.bonusPointSplit) closest += ', shared when tied';
      if (rules.bonusPointRangeCapped) closest += `, within ${rules.bonusRange} only`;
      parts.push(closest);
    }
    return `${parts.join(' · ')}.`;
  });

  constructor() {
    this.form.controls.side.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: (side) => {
        const margin = this.form.controls.margin;
        if (side === 'home' || side === 'away') this.marginSlot.set(side);
        if (side === 'draw') {
          margin.setValue('');
          margin.disable();
        } else if (margin.disabled) {
          margin.enable();
        }
      },
    });
    // Another fixture starts from a clean form.
    effect(() => {
      this.fixtureId();
      untracked(() => this.fill(null));
    });
  }

  /** The control shows its error once a submit was attempted. */
  invalid(field: 'side' | 'margin'): boolean {
    this.status();
    this.value();
    return this.submitted() && this.form.controls[field].invalid;
  }

  /** The range moved: its distance from the middle is the margin toward that side. */
  slide(event: Event): void {
    const signed = Number((event.target as HTMLInputElement).value);
    this.setSigned(signed);
  }

  /** A crest tapped: the pick moves one point toward that side (through a draw at the middle). */
  nudge(side: 'home' | 'away'): void {
    const { side: current, margin } = this.form.getRawValue();
    const parsed = parseMargin(margin) ?? 0;
    const signed = current === 'home' ? -parsed : current === 'away' ? parsed : 0;
    const step = side === 'home' ? -1 : 1;
    this.setSigned(Math.max(-150, Math.min(150, signed + step)));
  }

  pickDraw(): void {
    this.form.controls.side.setValue('draw');
  }

  /** A signed margin, negative toward home, zero a draw, onto the side and margin controls. */
  private setSigned(signed: number): void {
    if (signed === 0) {
      this.pickDraw();
      return;
    }
    this.form.controls.side.setValue(signed < 0 ? 'home' : 'away');
    this.form.controls.margin.setValue(String(Math.abs(signed)));
  }

  marginDisabled(): boolean {
    this.status();
    return this.value().side === 'draw';
  }

  /** Reopens the form with the member's pick, until kickoff. */
  edit(): void {
    this.fill(this.picks()?.myPick ?? null);
    this.editing.set(true);
    afterNextRender(() => this.scaleInput()?.nativeElement.focus(), { injector: this.injector });
  }

  cancel(): void {
    this.alerts.dismissKey(this.warningKey());
    this.editing.set(false);
    this.fill(null);
    afterNextRender(() => this.mineStrip()?.nativeElement.focus(), { injector: this.injector });
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    const { side, margin } = this.form.getRawValue();
    if (this.form.invalid || !side) {
      const problems: string[] = [];
      if (this.form.controls.side.invalid) problems.push('Choose a side or a draw.');
      if (this.form.controls.margin.invalid) problems.push('Enter a margin from 1 to 150.');
      highlightProblem(
        (this.form.controls.side.invalid ? this.scaleStrip() : this.marginInput())?.nativeElement,
      );
      const [first = 'Choose a side or a draw.', ...rest] = problems;
      this.alerts.warn(first, { key: this.warningKey(), details: rest });
      return;
    }
    this.alerts.dismissKey(this.warningKey());
    const pick: NewPick =
      side === 'draw' ? { side: 'draw', margin: 0 } : { side, margin: Number(margin.trim()) };
    this.saving.set(true);
    try {
      await this.view.savePick(this.fixtureId(), pick);
      this.alerts.dismissKey(this.failureKey());
      this.alerts.success(`Pick saved: ${this.describe(pick)}.`, { key: this.savedKey() });
      this.editing.set(false);
      this.fill(null);
      afterNextRender(() => this.mineStrip()?.nativeElement.focus(), { injector: this.injector });
    } catch (error) {
      this.refuse(error);
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * The API's refusal as the member reads it: a lock is a warning naming the kickoff, anything
   * else a failure that stays until dismissed or the pick saves.
   */
  private refuse(error: unknown): void {
    if (error instanceof ApiError && error.code === 'picks_locked') {
      const kickoff = this.time.pattern(this.picks()?.fixture.kickoffUtc ?? null, 'd MMM HH:mm z');
      this.alerts.warn(
        kickoff
          ? `Picks for this match closed at kickoff, ${kickoff}.`
          : 'Picks for this match closed at kickoff.',
        { key: this.warningKey() },
      );
      return;
    }
    this.alerts.error(
      error instanceof Error && error.message
        ? error.message
        : 'The pick could not be saved. Try again.',
      { key: this.failureKey() },
    );
  }

  /** The pick as the chip reads it: "Bulls by 20" or "a draw". */
  private describe(pick: NewPick): string {
    if (pick.side !== 'home' && pick.side !== 'away') return 'a draw';
    const name = this.sides()?.[pick.side].name ?? (pick.side === 'home' ? 'Home' : 'Away');
    return `${name} by ${pick.margin}`;
  }

  private savedKey(): string {
    return `pick-saved-${this.fixtureId()}`;
  }

  private fill(pick: MemberPick | null): void {
    const side = pick && pick.side !== 'missed' ? pick.side : null;
    this.form.reset({
      side,
      margin: side && side !== 'draw' && pick?.margin ? String(pick.margin) : '',
    });
    this.submitted.set(false);
  }
}

/** The member's choice in the form: a side or a draw. */
export type PickChoice = 'home' | 'away' | 'draw';

/** A side of the fixture as the panel draws it. */
export interface SideLook {
  readonly name: string;
  readonly colour: string | null;
  readonly accent: string | null;
  /** The banner colour for the sway bar. */
  readonly banner: string | null;
  readonly crest: string | null;
  readonly jersey: string;
}

/** The margin scale as the template draws it. */
export interface ScaleView {
  readonly side: PickChoice | null;
  /** The range input's value: the margin toward away, negative toward home, 0 a draw. */
  readonly range: number;
  /** The marker's position along the track, 0 at home, 100 at away. */
  readonly pct: number;
  readonly fillLeft: number;
  readonly fillRight: number;
  /** The marker's label: the margin, Draw, or Pick before a side is chosen. */
  readonly thumb: string;
  /** The pick in words, e.g. "Bulls by 20", "A draw", "No pick yet". */
  readonly text: string;
}

export interface PickMark {
  readonly key: 'w' | 'm' | 'b';
  readonly earned: boolean;
  /** A shared bonus point's share, e.g. 0.25. */
  readonly fraction: number | null;
  /** Visually hidden text for the mark. */
  readonly text: string;
}

export interface PoolRow {
  readonly row: PickRowView;
  readonly chip: PickChipView;
  readonly marks: readonly PickMark[];
}

function chipOf(row: PickRowView): PickChipView {
  const kind = row.side === 'missed' ? 'missed' : row.side === 'draw' ? 'draw' : 'club';
  return {
    kind,
    label: kind === 'club' ? (row.clubShortName ?? '') : kind === 'draw' ? 'Draw' : 'No pick',
    margin: kind === 'club' ? row.margin : null,
    colour: row.clubColour,
    accent: row.clubAccent,
    isDefault: row.isDefault,
  };
}

/** A points value without floating-point noise, e.g. 0.25 or 1.5. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
}
