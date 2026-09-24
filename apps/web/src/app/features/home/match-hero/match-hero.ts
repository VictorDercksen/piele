import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CLUB_BANNERS } from '../../../core/competition/club-banners';
import { Fixture } from '../../../core/competition/competition.models';
import { stadiumCountry } from '../../../core/competition/stadiums';
import { Icon } from '../../../shared/icon/icon';

/** Featured fixture with official club banners and stadium details. */
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
  /** Heading shown before the final whistle. */
  readonly label = input('FEATURED MATCH');
  /** Shows the link into the match centre. */
  readonly linked = input(true);
  readonly explore = output<void>();
  readonly homeBanner = computed(() => CLUB_BANNERS[this.fixture().homeAsset]);
  readonly awayBanner = computed(() => CLUB_BANNERS[this.fixture().awayAsset]);
  readonly country = computed(() => stadiumCountry(this.fixture().venue));
}
