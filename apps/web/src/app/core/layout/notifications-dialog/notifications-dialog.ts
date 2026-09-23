import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { RoundViewService } from '../../league/round-view.service';
import { Icon } from '../../../shared/icon/icon';

/** Round-scoped updates. In-app only, per the plan's notification default. */
@Component({
  selector: 'app-notifications-dialog',
  templateUrl: './notifications-dialog.html',
  styleUrl: './notifications-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class NotificationsDialog {
  private readonly router = inject(Router);
  readonly view = inject(RoundViewService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  go(path: string): void {
    this.close();
    void this.router.navigate([path], { queryParamsHandling: 'preserve' });
  }
}
