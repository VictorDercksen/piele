import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlayerView } from '../teamsheet';

/** Shared rows for a team's starters and replacements. */
@Component({
  selector: 'app-player-list',
  templateUrl: './player-list.html',
  styleUrl: './player-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.has-banner]': 'clubArtwork()' },
})
export class PlayerList {
  readonly players = input.required<readonly PlayerView[]>();
  readonly bench = input(false);
  readonly clubArtwork = input(false);
}
