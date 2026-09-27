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
import { Subscription } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { ClubTeam, Fixture } from '../../../core/competition/competition.models';
import { CompetitionService } from '../../../core/competition/competition.service';
import { LeagueTime } from '../../../core/competition/league-time';
import { AlertService } from '../../../core/feedback/alert.service';
import { BADGES } from '../../../core/league/badges';
import { ApiError } from '../../../core/league/http-league-data';
import { MemberPick, StewardPick } from '../../../core/league/league.models';
import {
  DerivedVsRecorded,
  PickRowView,
  RoundViewService,
} from '../../../core/league/round-view.service';
import { Dropdown } from '../../../shared/dropdown/dropdown';
import { Loader } from '../../../shared/loader/loader';
import { MemberAvatar } from '../../../shared/member-avatar/member-avatar';
import { CreateDutyDialog } from '../../duties/create-duty-dialog/create-duty-dialog';
import { ReasonDialog } from '../../duties/reason-dialog/reason-dialog';

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
  imports: [ReactiveFormsModule, NgIcon, Dropdown, Loader, MemberAvatar],
  viewProviders: [provideIcons({ lucideArrowRight })],
})
export class PicksCard {
  readonly view = inject(RoundViewService);
  private readonly competition = inject(CompetitionService);
  private readonly time = inject(LeagueTime);
  private readonly alerts = inject(AlertService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  /** The current rows' side and missed listeners, dropped whenever the grid is rebuilt. */
  private rowListeners = new Subscription();
  /** The desk's confirmation dialog. */
  readonly dialog = input.required<ReasonDialog>();
  /** The desk's duty form, for proposing a spoon duty. */
  readonly dutyDialog = input.required<CreateDutyDialog>();

  /** Members who pick this season, in team-sheet order. */
  readonly members = computed(() => this.view.members().filter((m) => m.inSeason));
  /** How each member shows (photo and team), by id. */
  private readonly looks = computed(
    () => new Map(this.view.derivedVsRecorded().map((row) => [row.memberId, row])),
  );

  private readonly chosenId = signal<string | null>(null);
  /** The round's fixtures with their pick state, for the strip. */
  readonly strip = computed<readonly StripItem[]>(() => {
    const members = this.members();
    return this.view.fixtures().map((fixture) => {
      const picks = this.view.picksFor(fixture.id);
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
    return chosen ? this.view.picksFor(chosen.fixture.id) : null;
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
  readonly defaultPicks = computed(() => this.view.rules().defaultPicks);

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
  readonly error = signal('');

  /** The member whose recorded total is being edited. */
  readonly overriding = signal<string | null>(null);
  readonly overrideControl = new FormControl<number | null>(null, {
    validators: [Validators.required, Validators.min(0), Validators.max(99999.99)],
  });
  readonly overrideSubmitted = signal(false);
  readonly overrideBusy = signal(false);
  readonly overrideError = signal('');

  /** The selected round's spoon holders, once the round is complete. */
  readonly spoon = computed(() => {
    const ids = this.view.roundBadges().spoon;
    return this.view
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
    this.destroyRef.onDestroy(() => this.rowListeners.unsubscribe());
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
    this.error.set('');
    const invalid = this.grid()
      .filter(({ group }) => {
        const { side, margin } = group.getRawValue();
        return (side === 'home' || side === 'away') && parseMargin(margin) === null;
      })
      .map(({ memberId }) => memberId);
    this.invalidRows.set(new Set(invalid));
    if (invalid.length) {
      this.error.set('Enter a margin from 1 to 150 for each home or away pick.');
      this.focus(`#pick-${fixtureId}-${invalid[0]}-margin`);
      return;
    }
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
      if (record.length) await this.view.recordPicks(fixtureId, record);
      for (const memberId of remove) await this.view.removePick(fixtureId, memberId);
      this.alerts.success(
        chosen ? `Picks saved for ${chosen.homeName} v ${chosen.awayName}.` : 'Picks saved.',
      );
    } catch (error) {
      const code = error instanceof ApiError ? error.code : '';
      this.error.set(
        REFUSALS[code] ??
          (error instanceof Error ? error.message : 'The picks could not be saved.'),
      );
      this.focus('#picks-error');
    } finally {
      this.busy.set(false);
      // A successful save rebuilds the grid from the saved picks; otherwise keep the edits.
      if (!this.baseline().readOnly) this.enableRows();
    }
  }

  startOverride(row: DerivedVsRecorded): void {
    this.overrideError.set('');
    this.overrideSubmitted.set(false);
    this.overrideControl.reset(row.recorded ?? row.derived);
    this.overriding.set(row.memberId);
    this.focus(`#override-${row.memberId}`);
  }

  cancelOverride(): void {
    const memberId = this.overriding();
    this.overriding.set(null);
    this.overrideError.set('');
    if (memberId) this.focus(`#override-button-${memberId}`);
  }

  submitOverride(event: Event, row: DerivedVsRecorded): void {
    event.preventDefault();
    void this.saveOverride(row);
  }

  async saveOverride(row: DerivedVsRecorded): Promise<void> {
    this.overrideSubmitted.set(true);
    if (this.overrideControl.invalid || this.overrideBusy()) return;
    const points = Number(this.overrideControl.value);
    const round = this.view.round();
    // A round's recorded totals are replaced as a whole: keep everyone else's.
    const entries = [
      ...this.view
        .derivedVsRecorded()
        .filter((r) => r.memberId !== row.memberId && r.recorded !== null)
        .map((r) => ({ memberId: r.memberId, points: r.recorded! })),
      { memberId: row.memberId, points },
    ];
    this.overrideBusy.set(true);
    this.overrideError.set('');
    try {
      await this.view.recordStandings(round.id, entries);
      this.alerts.success(`${row.name}'s ${round.title} total is recorded as ${points}.`);
      this.cancelOverride();
    } catch (error) {
      this.overrideError.set(
        error instanceof Error ? error.message : 'The total could not be recorded.',
      );
    } finally {
      this.overrideBusy.set(false);
    }
  }

  clearOverride(row: DerivedVsRecorded): void {
    const round = this.view.round();
    this.dialog().open({
      title: `Clear ${row.name}'s recorded total?`,
      description: `${row.name}'s ${round.title} total goes back to ${row.derived}, the total computed from the picks.`,
      submitLabel: 'Clear total',
      required: false,
      noReason: true,
      action: async () => {
        await this.view.clearStanding(round.id, row.memberId);
        this.overriding.set(null);
      },
      done: () => {
        this.alerts.success(`${row.name}'s ${round.title} total follows the picks again.`);
        this.focus(`#override-button-${row.memberId}`);
      },
    });
  }

  proposeSpoon(member: { readonly id: string; readonly name: string }): void {
    const round = this.view.round();
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
    this.rowListeners.unsubscribe();
    this.rowListeners = new Subscription();
    this.form.clear({ emitEvent: false });
    this.invalidRows.set(new Set());
    this.error.set('');
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
    this.rowListeners.add(
      c.side.valueChanges.subscribe({
        next: (side) => {
          if (side) c.missed.setValue(false, { emitEvent: false });
          if (side === 'draw') c.margin.setValue('', { emitEvent: false });
          if (side === 'draw') c.isDefault.setValue(false, { emitEvent: false });
          settle(group);
        },
      }),
    );
    this.rowListeners.add(
      c.missed.valueChanges.subscribe({
        next: (missed) => {
          if (missed) {
            c.side.setValue('', { emitEvent: false });
            c.margin.setValue('', { emitEvent: false });
            c.isDefault.setValue(false, { emitEvent: false });
          }
          settle(group);
        },
      }),
    );
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
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
