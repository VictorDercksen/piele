import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Fixture } from '../../../core/competition/competition.models';
import { jersey } from '../../../core/competition/teams';
import { Icon } from '../../../shared/icon/icon';

/** Floodlights match centre: poster artwork and the score panel for the featured fixture. */
@Component({
  selector: 'app-match-hero',
  templateUrl: './match-hero.html',
  styleUrl: './match-hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class MatchHero {
  readonly fixture = input.required<Fixture>();
  readonly roundCode = input.required<string>();
  readonly favourite = input('');
  readonly explore = output<void>();
  readonly jersey = jersey;
}
