import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RoundViewService } from '../../core/league/round-view.service';
import { MemberAvatar } from '../../shared/member-avatar/member-avatar';

/** Round standings. Superbru points and house marks are separate measures. */
@Component({
  selector: 'app-standings-page',
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MemberAvatar],
})
export class StandingsPage {
  readonly view = inject(RoundViewService);
  readonly measure = signal<'points' | 'marks'>('points');
}
