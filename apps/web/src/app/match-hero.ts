import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ConceptId } from './concepts';
import { jersey } from './teams';
import { Icon } from './icon';

@Component({
  selector: 'app-match-hero',
  templateUrl: './match-hero.html',
  styleUrl: './match-hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class MatchHero {
  readonly design = input.required<ConceptId>();
  readonly fixtures = input.required<readonly FixturePreview[]>();
  readonly roundCode = input('03');
  readonly roundDates = input('09–11 Oct 2026');
  readonly explore = output<void>();
  readonly favourite = input('');
  readonly jersey = jersey;
  readonly selected = signal(-1);
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
  readonly clubs = computed(() => {
    const jerseyAssets = new Set([
      'dhl-stormers',
      'munster-rugby',
      'vodacom-bulls',
      'hollywoodbets-sharks',
      'glasgow-warriors',
    ]);
    const pairs =
      this.fixtures().length > 2
        ? [this.fixtures()[0], this.fixtures()[2]]
        : this.fixtures().slice(0, 2);
    return pairs
      .flatMap((match, index) => [
        { name: match.home, asset: match.homeAsset, left: 27, top: index === 0 ? 27 : 74 },
        { name: match.away, asset: match.awayAsset, left: 73, top: index === 0 ? 27 : 74 },
      ])
      .map((club) => ({
        ...club,
        image:
          'assets/images/' +
          (jerseyAssets.has(club.asset) ? 'jerseys/' : 'teams/') +
          club.asset +
          '.png',
      }));
  });
}

export interface FixturePreview {
  id?: string;
  kickoffUtc?: string | null;
  home: string;
  away: string;
  homeAsset: string;
  awayAsset: string;
  day: string;
  time: string;
  venue: string;
  score?: string;
}
