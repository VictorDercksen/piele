import { HlmRadioGroup } from '@spartan-ng/helm/radio-group';
import { HlmRadio } from '@spartan-ng/helm/radio-group';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmCheckbox } from '@spartan-ng/helm/checkbox';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucidePencil, lucideTrash2, lucideX } from '@ng-icons/lucide';
import { ClubTeam, Fixture } from '../../../core/competition/competition.models';
import { CompetitionService } from '../../../core/competition/competition.service';
import { FixtureService } from '../../../core/competition/fixture.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { highlightProblem } from '../../../core/feedback/problem-highlight';
import { BADGES } from '../../../core/league/badges';
import { ApiError } from '../../../core/api/api-error';
import { MemberPick, StewardPick } from '../../../core/league/league.models';
import { MemberService } from '../../../core/league/members/member.service';
import { PickControlService } from '../../../core/league/picks/pick-control.service';
import { PickRowView } from '../../../core/league/picks/pick.models';
import { PickService } from '../../../core/league/picks/pick.service';
import { RulesService } from '../../../core/league/rules/rules.service';
import { StandingControlService } from '../../../core/league/standings/standing-control.service';
import { DerivedVsRecorded } from '../../../core/league/standings/standing.models';
import { StandingService } from '../../../core/league/standings/standing.service';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { Loader } from '../../../shared/loader/loader';
import { MemberAvatar } from '../../../shared/member-avatar/member-avatar';
import { CreateDutyDialog } from '../../duties/create-duty-dialog/create-duty-dialog';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';
import { capDetails } from '../alert-details';

/** The keys of this card's alerts, one per form, so a new attempt replaces the last one's. */
const ALERT_KEYS = { grid: 'picks-grid', override: 'picks-override' } as const;

/** Refusals that are about the picks rather than a failure: warnings, not errors. */
const WARNINGS: ReadonlySet<string> = new Set(['picks_locked']);

/** Refusals worth their own words; any other code shows the API's message. */
const REFUSALS: Readonly<Record<string, string>> = {
  invalid_pick: 'Each pick needs a side and a margin from 1 to 150, a draw, or missed.',
  unknown_member: 'A member on this grid is no longer on the team sheet. Reload and try again.',
  duplicate_member: 'A member appears twice. Reload and try again.',
  unknown_fixture: 'That match is not in the schedule.',
  unknown_duty: 'A linked pick confirmation duty no longer belongs to that member.',
  captain_only: 'Only the captain or the admin can record picks.',
};

/**
 * The captain's desk's Superbru picks for the selected round: a strip of the round's fixtures
 * with each one's pick state, and for the chosen fixture a grid of every member's pick that
 * the steward can record or correct from kickoff (sides, margins, Superbru defaults and missed
 * picks, sending only the rows that changed). Under it, the round's derived totals beside
 * the recorded ones with an inline override, and the round's spoon holders with a shortcut to
 * propose their duty.
 */
@Component({
  selector: 'app-picks-card',
  templateUrl: './picks-card.html',
  styleUrl: './picks-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* prettier-ignore */
  imports: [
    ReactiveFormsModule,
    NgIcon,
    Dropdown,
    Loader,
    MemberAvatar,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmCheckbox,
    HlmRadioGroup,
    HlmRadio,
  ],
  viewProviders: [provideIcons({ lucideArrowRight, lucidePencil, lucideTrash2, lucideX })],
})
export class PicksCard {
  readonly fixtureService = inject(FixtureService);
  private readonly memberService = inject(MemberService);
  private readonly pickService = inject(PickService);
  private readonly pickControl = inject(PickControlService);
  private readonly rulesService = inject(RulesService);
  readonly standingService = inject(StandingService);
  private readonly standingControl = inject(StandingControlService);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  private readonly alerts = inject(AlertService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  /** The current rows' side and missed listeners, dropped whenever the grid is rebuilt. */
  private readonly rebuildRows = new Subject<void>();
  /** The desk's confirmation dialog. */
  readonly dialog = input.required<ReasonDialog>();
  /** The desk's duty form, for proposing a spoon duty. */
  readonly dutyDialog = input.required<CreateDutyDialog>();

  /** Members who pick this season, in team-sheet order. */
  readonly members = computed(() => this.memberService.members().filter((m) => m.inSeason));
  /** How each member shows (photo and team), by id. */
  private readonly looks = computed(
    () => new Map(this.standingService.derivedVsRecorded().map((row) => [row.memberId, row])),
  );

  private readonly chosenId = signal<string | null>(null);
  /** The round's fixtures with their pick state, for the strip. */
  readonly strip = computed<readonly StripItem[]>(() => {
    const members = this.members();
    return this.fixtureService.fixtures().map((fixture) => {
      const picks = this.pickService.picksFor(fixture.id);
      const picked = new Set(picks?.rows.map((row) => row.memberId) ?? []);
      const missing = members.filter((m) => !picked.has(m.id)).length;
      const locked = picks?.locked ?? false;
      return {
        fixture,
        home: this.club(fixture.homeAsset),
        away: this.club(fixture.awayAsset),
        homeName: this.club(fixture.homeAsset)?.shortName ?? shortName(fixture.home),
        awayName: this.club(fixture.awayAsset)?.shortName ?? shortName(fixture.away),
        locked,
        awaiting: locked && missing > 0,
        status: picks?.void
          ? 'Void'
          : picks?.final
            ? 'Final'
            : picks?.provisional
              ? 'Provisional'
              : !locked
                ? fixture.kickoffUtc
                  ? `Locks ${this.time.pattern(fixture.kickoffUtc, 'd MMM HH:mm')}`
                  : 'Kickoff to be confirmed'
                : missing
                  ? 'Awaiting picks'
                  : 'Recorded',
      };
    });
  });
  /** The chosen fixture, else the first awaiting picks, else the latest locked, else the first. */
  readonly chosen = computed<StripItem | null>(() => {
    const strip = this.strip();
    return (
      strip.find((item) => item.fixture.id === this.chosenId()) ??
      strip.find((item) => item.awaiting) ??
      strip.filter((item) => item.locked).at(-1) ??
      strip[0] ??
      null
    );
  });
  readonly picks = computed(() => {
    const chosen = this.chosen();
    return chosen ? this.pickService.picksFor(chosen.fixture.id) : null;
  });
  /** Before kickoff members make their own picks: the grid only shows them. */
  readonly readOnly = computed(() => !this.picks()?.locked);
  /** A score to count: each row shows its points. */
  readonly scored = computed(() => {
    const picks = this.picks();
    return !!picks && (picks.provisional || picks.final);
  });
  readonly scores = computed(
    () => new Map((this.picks()?.rows ?? []).map((row) => [row.memberId, row])),
  );
  readonly badges = BADGES;
  readonly defaultPicks = computed(() => this.rulesService.rules().defaultPicks);

  /**
   * The saved picks the grid starts from, compared by content so a live score or a clock tick
   * does not rebuild the grid under the steward's hands.
   */
  private readonly baseline = computed<Baseline>(
    () => {
      const chosen = this.chosen();
      const members = this.members();
      const saved = new Map<string, MemberPick>();
      for (const row of this.picks()?.rows ?? []) saved.set(row.memberId, row);
      const readOnly = this.readOnly();
      const key = [
        chosen?.fixture.id ?? '',
        readOnly,
        members.map((m) => m.id).join(','),
        [...saved.values()]
          .map((p) => `${p.memberId}:${p.side}:${p.margin}:${p.isDefault}:${p.dutyId}`)
          .join(','),
      ].join('|');
      return { key, fixtureId: chosen?.fixture.id ?? null, readOnly, members, saved };
    },
    { equal: (a, b) => a.key === b.key },
  );

  /** One row per member: side, margin, default and missed. */
  readonly form = new FormArray<PickRow>([]);
  /** The grid's rows as last built, with the member each belongs to. */
  readonly grid = signal<readonly GridRow[]>([]);
  /** Members whose margin needs fixing, after a save attempt. */
  readonly invalidRows = signal<ReadonlySet<string>>(new Set());
  readonly busy = signal(false);
  /** The fixture the grid was last built for, so a new fixture drops the last one's card. */
  private builtFixtureId: string | null = null;

  /** The member whose recorded total is being edited. */
  readonly overriding = signal<string | null>(null);
  readonly overrideControl = new FormControl<number | null>(null, {
    validators: [Validators.required, Validators.min(0), Validators.max(99999.99)],
  });
  readonly overrideSubmitted = signal(false);
  readonly overrideBusy = signal(false);

  /** The selected round's spoon holders, once the round is complete. */
  readonly spoon = computed(() => {
    const ids = this.standingService.roundBadges().spoon;
    return this.standingService
      .derivedVsRecorded()
      .filter((row) => ids.includes(row.memberId))
      .map((row) => ({ id: row.memberId, name: row.name }));
  });
  readonly spoonNames = computed(() =>
    this.spoon()
      .map((m) => m.name)
      .join(', '),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.rebuildRows.complete());
    effect(() => {
      const baseline = this.baseline();
      untracked(() => this.build(baseline));
    });
  }

  choose(fixtureId: string): void {
    this.chosenId.set(fixtureId);
  }

  look(memberId: string): DerivedVsRecorded | undefined {
    return this.looks().get(memberId);
  }

  score(memberId: string): PickRowView | undefined {
    return this.scores().get(memberId);
  }

  jersey(teamId: string): string {
    return this.competition.current().jersey(teamId);
  }

  async save(): Promise<void> {
    const baseline = this.baseline();
    const fixtureId = baseline.fixtureId;
    if (!fixtureId || baseline.readOnly || this.busy()) return;
    const invalid = this.grid().filter(({ group }) => {
      const { side, margin } = group.getRawValue();
      return (side === 'home' || side === 'away') && parseMargin(margin) === null;
    });
    this.invalidRows.set(new Set(invalid.map(({ memberId }) => memberId)));
    if (invalid.length) {
      // The rows stay flagged (aria-invalid); the card names who needs a margin.
      this.alerts.warn('Enter a margin from 1 to 150 for each home or away pick.', {
        key: ALERT_KEYS.grid,
        details: capDetails(invalid.map(({ name }) => `${name} needs a margin.`)),
      });
      this.highlight(`#pick-${fixtureId}-${invalid[0].memberId}-margin`);
      return;
    }
    this.alerts.dismissKey(ALERT_KEYS.grid);
    const record: StewardPick[] = [];
    const remove: string[] = [];
    for (const { memberId, group } of this.grid()) {
      const wanted = pickOf(group);
      const saved = baseline.saved.get(memberId);
      if (!wanted) {
        if (saved) remove.push(memberId);
        continue;
      }
      if (
        saved &&
        saved.side === wanted.side &&
        saved.margin === wanted.margin &&
        saved.isDefault === wanted.isDefault
      )
        continue;
      record.push({ memberId, ...wanted, ...(saved?.dutyId ? { dutyId: saved.dutyId } : {}) });
    }
    if (!record.length && !remove.length) {
      this.alerts.info('No picks changed.');
      return;
    }
    const chosen = this.chosen();
    this.busy.set(true);
    this.form.disable({ emitEvent: false });
    try {
      if (record.length) await this.pickControl.recordPicks(fixtureId, record);
      for (const memberId of remove) await this.pickControl.removePick(fixtureId, memberId);
      this.alerts.success(
        chosen ? `Picks saved for ${chosen.homeName} v ${chosen.awayName}.` : 'Picks saved.',
      );
    } catch (error) {
      const code = error instanceof ApiError ? error.code : '';
      const message =
        REFUSALS[code] ??
        (error instanceof Error ? error.message : 'The picks could not be saved.');
      if (WARNINGS.has(code)) this.alerts.warn(message, { key: ALERT_KEYS.grid });
      else this.alerts.error(message, { key: ALERT_KEYS.grid });
    } finally {
      this.busy.set(false);
      // A successful save rebuilds the grid from the saved picks; otherwise keep the edits.
      if (!this.baseline().readOnly) this.enableRows();
    }
  }

  startOverride(row: DerivedVsRecorded): void {
    this.alerts.dismissKey(ALERT_KEYS.override);
    this.overrideSubmitted.set(false);
    this.overrideControl.reset(row.recorded ?? row.derived);
    this.overriding.set(row.memberId);
    this.focus(`#override-${row.memberId}`);
  }

  cancelOverride(): void {
    const memberId = this.overriding();
    this.overriding.set(null);
    this.alerts.dismissKey(ALERT_KEYS.override);
    if (memberId) this.focus(`#override-button-${memberId}`);
  }

  submitOverride(event: Event, row: DerivedVsRecorded): void {
    event.preventDefault();
    void this.saveOverride(row);
  }

  async saveOverride(row: DerivedVsRecorded): Promise<void> {
    if (this.overrideBusy()) return;
    this.overrideSubmitted.set(true);
    if (this.overrideControl.invalid) {
      this.alerts.warn('Enter a total from 0 to 99999.99.', { key: ALERT_KEYS.override });
      this.highlight(`#override-${row.memberId}`);
      return;
    }
    this.alerts.dismissKey(ALERT_KEYS.override);
    const points = Number(this.overrideControl.value);
    const round = this.fixtureService.round();
    // A round's recorded totals are replaced as a whole: keep everyone else's.
    const entries = [
      ...this.standingService
        .derivedVsRecorded()
        .filter((r) => r.memberId !== row.memberId && r.recorded !== null)
        .map((r) => ({ memberId: r.memberId, points: r.recorded! })),
      { memberId: row.memberId, points },
    ];
    this.overrideBusy.set(true);
    try {
      await this.standingControl.recordStandings(round.id, entries);
      this.alerts.success(`${row.name}'s ${round.title} total is recorded as ${points}.`);
      this.cancelOverride();
    } catch (error) {
      this.alerts.error(
        error instanceof Error ? error.message : 'The total could not be recorded.',
        {
          key: ALERT_KEYS.override,
        },
      );
    } finally {
      this.overrideBusy.set(false);
    }
  }

  clearOverride(row: DerivedVsRecorded): void {
    const round = this.fixtureService.round();
    this.dialog().open({
      title: `Clear ${row.name}'s recorded total?`,
      description: `${row.name}'s ${round.title} total goes back to ${row.derived}, the total computed from the picks.`,
      submitLabel: 'Clear total',
      required: false,
      noReason: true,
      action: async () => {
        await this.standingControl.clearStanding(round.id, row.memberId);
        this.overriding.set(null);
      },
      done: () => {
        this.alerts.success(`${row.name}'s ${round.title} total follows the picks again.`);
        this.focus(`#override-button-${row.memberId}`);
      },
    });
  }

  proposeSpoon(member: { readonly id: string; readonly name: string }): void {
    const round = this.fixtureService.round();
    this.dutyDialog().open({
      memberId: member.id,
      type: 'spoon',
      roundId: round.id,
      reason: `Last place in ${round.title}.`,
    });
  }

  private club(teamId: string): ClubTeam | undefined {
    return this.competition.current().team(teamId);
  }

  /** Rebuilds the grid from the saved picks of the chosen fixture. */
  private build(baseline: Baseline): void {
    this.rebuildRows.next();
    this.form.clear({ emitEvent: false });
    this.invalidRows.set(new Set());
    if (baseline.fixtureId !== this.builtFixtureId) this.alerts.dismissKey(ALERT_KEYS.grid);
    this.builtFixtureId = baseline.fixtureId;
    const rows = baseline.members.map((member) => {
      const group = pickRow(baseline.saved.get(member.id));
      this.wire(group);
      this.form.push(group, { emitEvent: false });
      return { memberId: member.id, name: member.name, teamId: member.teamId, group };
    });
    this.grid.set(rows);
    if (baseline.readOnly) this.form.disable({ emitEvent: false });
    else this.enableRows();
  }

  /** Enables every row, then turns off what its side rules out. */
  private enableRows(): void {
    this.form.enable({ emitEvent: false });
    for (const group of this.form.controls) settle(group);
  }

  /** A draw clears and locks the margin; missed clears the side and margin; a side clears missed. */
  private wire(group: PickRow): void {
    const c = group.controls;
    c.side.valueChanges
      .pipe(takeUntil(this.rebuildRows), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (side) => {
          if (side) c.missed.setValue(false, { emitEvent: false });
          if (side === 'draw') c.margin.setValue('', { emitEvent: false });
          if (side === 'draw') c.isDefault.setValue(false, { emitEvent: false });
          settle(group);
        },
      });
    c.missed.valueChanges
      .pipe(takeUntil(this.rebuildRows), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (missed) => {
          if (missed) {
            c.side.setValue('', { emitEvent: false });
            c.margin.setValue('', { emitEvent: false });
            c.isDefault.setValue(false, { emitEvent: false });
          }
          settle(group);
        },
      });
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  /** Points a problem out without moving focus (focusing a text box zooms a phone). */
  private highlight(selector: string): void {
    afterNextRender(
      () => highlightProblem(this.host.nativeElement.querySelector<HTMLElement>(selector)),
      { injector: this.injector },
    );
  }
}

type PickRow = FormGroup<{
  side: FormControl<'home' | 'away' | 'draw' | ''>;
  margin: FormControl<string>;
  isDefault: FormControl<boolean>;
  missed: FormControl<boolean>;
}>;

function pickRow(pick: MemberPick | undefined): PickRow {
  const side = pick && pick.side !== 'missed' ? pick.side : '';
  return new FormGroup({
    side: new FormControl<'home' | 'away' | 'draw' | ''>(side, { nonNullable: true }),
    margin: new FormControl(
      pick && (pick.side === 'home' || pick.side === 'away') && pick.margin !== null
        ? String(pick.margin)
        : '',
      { nonNullable: true },
    ),
    isDefault: new FormControl(pick?.isDefault ?? false, { nonNullable: true }),
    missed: new FormControl(pick?.side === 'missed', { nonNullable: true }),
  });
}

/** Disables the margin for a draw or a missed pick, and the default for both. */
function settle(group: PickRow): void {
  if (group.disabled) return;
  const { side, missed } = group.getRawValue();
  const c = group.controls;
  const noMargin = side === 'draw' || missed;
  if (noMargin) c.margin.disable({ emitEvent: false });
  else c.margin.enable({ emitEvent: false });
  if (noMargin) c.isDefault.disable({ emitEvent: false });
  else c.isDefault.enable({ emitEvent: false });
}

/** A whole number from 1 to 150, or null. */
function parseMargin(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const margin = Number(text);
  return margin >= 1 && margin <= 150 ? margin : null;
}

/** The pick a row describes, or null for an empty row. Call once margins are checked. */
function pickOf(group: PickRow): Pick<MemberPick, 'side' | 'margin' | 'isDefault'> | null {
  const { side, margin, isDefault, missed } = group.getRawValue();
  if (missed) return { side: 'missed', margin: null, isDefault: false };
  if (side === 'draw') return { side: 'draw', margin: 0, isDefault: false };
  if (side === 'home' || side === 'away') return { side, margin: parseMargin(margin), isDefault };
  return null;
}

/** "Sharks" from "Hollywoodbets Sharks" when the club is not in the catalogue. */
function shortName(name: string): string {
  return name === 'To be confirmed' ? 'TBC' : (name.split(' ').at(-1) ?? name);
}

interface Baseline {
  readonly key: string;
  readonly fixtureId: string | null;
  readonly readOnly: boolean;
  readonly members: readonly {
    readonly id: string;
    readonly name: string;
    readonly teamId: string;
  }[];
  readonly saved: ReadonlyMap<string, MemberPick>;
}

/** One fixture in the strip. */
export interface StripItem {
  readonly fixture: Fixture;
  readonly home: ClubTeam | undefined;
  readonly away: ClubTeam | undefined;
  readonly homeName: string;
  readonly awayName: string;
  readonly locked: boolean;
  /** Locked with members still missing a pick. */
  readonly awaiting: boolean;
  readonly status: string;
}

/** One member's row in the grid. */
export interface GridRow {
  readonly memberId: string;
  readonly name: string;
  readonly teamId: string;
  readonly group: PickRow;
}
