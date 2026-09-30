import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmSlider } from '@spartan-ng/helm/slider';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { PoolPicksTable } from '../pool-picks-table/pool-picks-table';
import { ordinal } from '../../../shared/format/ordinal';
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
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideEyeOff,
  lucideLock,
  lucideMinus,
  lucidePencil,
  lucidePlus,
  lucideX,
} from '@ng-icons/lucide';
import { map } from 'rxjs';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { LeagueTimePipe } from '../../../core/competition/league-time.pipe';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { LeaguePathPipe } from '../../../core/league/league-path.pipe';
import { MemberPick } from '../../../core/league/league.models';
import { MemberService } from '../../../core/league/members/member.service';
import { PickControlService } from '../../../core/league/picks/pick-control.service';
import { PickService } from '../../../core/league/picks/pick.service';
import { RulesService } from '../../../core/league/rules/rules.service';
import { roundType } from '../../../core/league/superbru';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { StatusPill } from '../section-status';
import { PickChip } from './pick-chip';
import { PickChipView } from './pick-chip.models';
import { chipOf } from './pick-chip.view';
import {
  createPickForm,
  pickFormValue,
  parseMargin,
  pickFromForm,
  pickProblems,
  signedMargin,
} from './picks-panel.form';
import { ScaleView, SideLook } from './picks-panel.models';
import { pickRefusal } from './picks-panel.refusals';
import {
  QUICK_MARGINS,
  SCALE_REACH,
  describePick,
  scaleOf,
  scoringLegend,
} from './picks-panel.view';

/**
 * The match centre's "Pool picks." panel. Before kickoff a member without a pick sees only
 * their own pick form: the matchup, a crest button for each side, over the margin scale, a range
 * where the marker's distance from the middle is the margin toward that side and the middle is a
 * draw (`slide`, `nudge` from either crest, `pickDraw`, the `quick` margins, the typed margin and
 * its stepper, all writing the same two form controls). Once their
 * pick is in they see their own pick, and can edit theirs until kickoff. After kickoff their
 * line carries their points and place. The pool's split and the pool table itself (every pick
 * with its outcome, margin and bonus marks and points, as PickService scores them) are the body
 * of the panel's dropdown (`#picks-pool`), closed by default and for every new fixture; the form
 * or the pick above it is the dropdown's lead. The admin viewing a league it is not in sees the
 * pool without a form.
 */
@Component({
  selector: 'app-picks-panel',
  templateUrl: './picks-panel.html',
  styleUrl: './picks-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    PoolPicksTable,
    DecimalPipe,
    Dropdown,
    ReactiveFormsModule,
    RouterLink,
    LeaguePathPipe,
    LeagueTimePipe,
    NgIcon,
    PickChip,
    HlmBadge,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmSlider,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowRight,
      lucideEyeOff,
      lucideLock,
      lucideMinus,
      lucidePencil,
      lucidePlus,
      lucideX,
    }),
  ],
})
export class PicksPanel {
  private readonly alerts = inject(AlertService);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  private readonly injector = inject(Injector);
  private readonly pickService = inject(PickService);
  private readonly pickControl = inject(PickControlService);
  private readonly members = inject(MemberService);
  protected readonly rules = inject(RulesService);
  /** The display zone for the kickoff. */
  protected readonly zone = this.time.zone;

  readonly fixtureId = input.required<string>();

  /** The fixture's picks as the pick service gives them. */
  readonly picks = computed(() => this.pickService.picksFor(this.fixtureId()));
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

  readonly form = createPickForm();
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  private readonly scaleInput = viewChild<HlmSlider>('scaleInput');
  private readonly scaleStrip = viewChild<ElementRef<HTMLElement>>('scaleStrip');
  private readonly marginInput = viewChild<ElementRef<HTMLInputElement>>('marginInput');
  private readonly mineStrip = viewChild<ElementRef<HTMLElement>>('mineStrip');

  /** How far the scale runs each way; the template draws its ticks from it. */
  protected readonly reach = SCALE_REACH;
  /** The quick margins each side of the Draw chip, the home side's running in toward it. */
  protected readonly homeQuick: readonly number[] = [...QUICK_MARGINS].reverse();
  protected readonly awayQuick = QUICK_MARGINS;

  /**
   * The scale as drawn from the form: the range's value (home is left, so negative), the marker's
   * position and label, the fill from the middle, and the pick in words for the range's
   * `aria-valuetext`.
   */
  readonly scale = computed<ScaleView>(() => {
    this.status();
    const { side, margin } = this.value();
    return scaleOf(side, margin, this.sides());
  });

  /** The member's own form: before kickoff, for a member, until the pick is in or while editing. */
  readonly showForm = computed(() => {
    const picks = this.picks();
    return (
      !!picks && !picks.locked && !this.members.adminView() && (!picks.recorded || this.editing())
    );
  });
  /** The pool's picks show once the member's pick is in, after kickoff, or for the admin. */
  readonly showPool = computed(() => {
    const picks = this.picks();
    return !!picks && !picks.hidden;
  });
  readonly tag = computed<StatusPill>(() => {
    const picks = this.picks();
    if (!picks || !picks.locked) return { label: 'open', tone: 'pending' };
    if (picks.void) return { label: 'void', tone: 'muted' };
    if (picks.final) return { label: 'final', tone: 'done' };
    if (picks.provisional) return { label: 'provisional', tone: 'live' };
    return picks.recorded || this.members.adminView()
      ? { label: 'locked', tone: 'muted' }
      : { label: 'awaiting picks', tone: 'pending' };
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

  /** The member's own line: pick chip, points and place. Null for the admin view. */
  readonly mine = computed(() => {
    const picks = this.picks();
    if (!picks || this.members.adminView()) return null;
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
    if (!picks?.locked || !this.members.administers()) return false;
    const picked = new Set(picks.rows.filter((r) => r.side !== 'missed').map((r) => r.memberId));
    return this.members.members().some((member) => !picked.has(member.id));
  });

  /** The rules line under the table, from the season's rules and this round's win points. */
  readonly legend = computed(() => {
    const picks = this.picks();
    const rules = this.rules.rules();
    const wp = picks ? rules.winPoints[roundType(picks.round.id, this.competition.current())] : 0;
    return scoringLegend(rules, wp);
  });

  constructor() {
    this.form.controls.side.valueChanges.pipe(takeUntilDestroyed()).subscribe({
      next: (side) => {
        const margin = this.form.controls.margin;
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
  slide(values: number[]): void {
    this.setSigned(values[0] ?? 0);
  }

  /** A crest tapped: the pick moves one point toward that side (through a draw at the middle). */
  nudge(side: 'home' | 'away'): void {
    const { side: current, margin } = this.form.getRawValue();
    const signed = signedMargin(current, margin);
    const step = side === 'home' ? -1 : 1;
    this.setSigned(Math.max(-150, Math.min(150, signed + step)));
  }

  pickDraw(): void {
    this.form.controls.side.setValue('draw');
  }

  /** A quick margin tapped: that side by that many. */
  quick(side: 'home' | 'away', margin: number): void {
    this.setSigned(side === 'home' ? -margin : margin);
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

  /** The margin stepper works once a club is chosen. */
  stepsMargin(): boolean {
    this.status();
    const side = this.value().side;
    return side === 'home' || side === 'away';
  }

  /** The stepper moved the margin a point, keeping the side and staying from 1 to 150. */
  stepMargin(delta: 1 | -1): void {
    const { side, margin } = this.form.getRawValue();
    if (side !== 'home' && side !== 'away') return;
    const next = Math.max(1, Math.min(150, (parseMargin(margin) ?? 0) + delta));
    this.form.controls.margin.setValue(String(next));
  }

  marginDisabled(): boolean {
    this.status();
    return this.value().side === 'draw';
  }

  /** Reopens the form with the member's pick, until kickoff. */
  edit(): void {
    this.fill(this.picks()?.myPick ?? null);
    this.editing.set(true);
    afterNextRender(() => this.scaleInput()?.focus(), { injector: this.injector });
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
      const problems = pickProblems(
        this.form.controls.side.invalid,
        this.form.controls.margin.invalid,
      );
      highlightProblem(
        (this.form.controls.side.invalid ? this.scaleStrip() : this.marginInput())?.nativeElement,
      );
      const [first = 'Choose a side or a draw.', ...rest] = problems;
      this.alerts.warn(first, { key: this.warningKey(), details: rest });
      return;
    }
    this.alerts.dismissKey(this.warningKey());
    const pick = pickFromForm(side, margin);
    this.saving.set(true);
    try {
      await this.pickControl.savePick(this.fixtureId(), pick);
      this.alerts.dismissKey(this.failureKey());
      this.alerts.success(`Pick saved: ${describePick(pick, this.sides())}.`, {
        key: this.savedKey(),
      });
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
    const kickoff = this.time.pattern(this.picks()?.fixture.kickoffUtc ?? null, 'd MMM HH:mm z');
    const refusal = pickRefusal(error, kickoff);
    if (refusal.level === 'warn') {
      this.alerts.warn(refusal.message, { key: this.warningKey() });
      return;
    }
    this.alerts.error(refusal.message, { key: this.failureKey() });
  }

  private savedKey(): string {
    return `pick-saved-${this.fixtureId()}`;
  }

  private fill(pick: MemberPick | null): void {
    this.form.reset(pickFormValue(pick));
    this.submitted.set(false);
  }
}
