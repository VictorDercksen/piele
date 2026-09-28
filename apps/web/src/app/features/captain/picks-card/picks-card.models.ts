import { FormControl, FormGroup } from '@angular/forms';
import { ClubTeam, Fixture } from '../../../core/competition/competition.models';
import { MemberPick } from '../../../core/league/league.models';

/** One member's pick controls: side, margin, default and missed. */
export type PickRow = FormGroup<{
  side: FormControl<'home' | 'away' | 'draw' | ''>;
  margin: FormControl<string>;
  isDefault: FormControl<boolean>;
  missed: FormControl<boolean>;
}>;

/** The saved picks a grid is built from, with the content key it is compared by. */
export interface Baseline {
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
