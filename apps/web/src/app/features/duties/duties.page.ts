import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { RoundViewService } from '../../core/league/round-view.service';
import { Icon } from '../../shared/icon/icon';
import { EvidenceDialog } from './evidence-dialog/evidence-dialog';

/** The selected round's duty register, filtered to the member's own duties or the league's. */
@Component({
  selector: 'app-duties-page',
  templateUrl: './duties.page.html',
  styleUrl: './duties.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, EvidenceDialog],
})
export class DutiesPage {
  readonly view = inject(RoundViewService);
  readonly evidence = viewChild.required(EvidenceDialog);
  readonly scope = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => (params.get('scope') === 'league' ? 'league' : 'mine')),
    ),
    { initialValue: 'mine' },
  );
  readonly visibleDuties = computed(() =>
    this.scope() === 'mine' ? this.view.duties().filter((duty) => duty.mine) : this.view.duties(),
  );
}
