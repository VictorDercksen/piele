import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Fixture } from '../../../core/competition/competition.models';
import { jersey } from '../../../core/competition/teams';
import { Icon } from '../../../shared/icon/icon';

/** Floodlights match centre: poster artwork, score panel and the round's fixture ribbon. */
@Component({
  selector: 'app-match-hero',
  templateUrl: './match-hero.html',
  styleUrl: './match-hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class MatchHero {
  readonly fixtures = input.required<readonly Fixture[]>();
  readonly roundCode = input.required<string>();
  readonly favourite = input('');
  readonly explore = output<void>();
  readonly jersey = jersey;
  readonly selected = signal(-1);
  /** Defaults to the member's favourite team's fixture, then the round opener. */
  readonly selectedIndex = computed(() =>
    this.selected() >= 0
      ? this.selected()
      : Math.max(
          0,
          this.fixtures().findIndex(
            (match) => match.homeAsset === this.favourite() || match.awayAsset === this.favourite(),
          ),
        ),
  );
  readonly fixture = computed(() => this.fixtures()[this.selectedIndex()]);
}
