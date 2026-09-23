import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RoundViewService } from '../../core/league/round-view.service';
import { Icon } from '../../shared/icon/icon';

/** Items awaiting the captain in the selected round. The API enforces captain authority. */
@Component({
  selector: 'app-captain-page',
  templateUrl: './captain.page.html',
  styleUrl: './captain.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class CaptainPage {
  readonly view = inject(RoundViewService);
}
