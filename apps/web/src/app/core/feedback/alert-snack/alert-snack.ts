import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Icon } from '../../../shared/icon/icon';
import { Alert, AlertService, AlertSeverity } from '../alert.service';
import { LayoutInsets } from '../layout-insets';

/** The severity in words on every card, so colour is never the only signal. */
export const ALERT_EYEBROWS: Readonly<Record<AlertSeverity, string>> = {
  error: 'Red card',
  warning: 'Yellow card',
  success: 'Try',
  info: 'Referee',
};

/**
 * The app's alerts as referee's cards drawn from a pocket at the bottom of the screen.
 *
 * The stack is a manual popover in the top layer, so it shows above the page and above a modal
 * `<dialog>` opened before it. A modal makes everything outside itself inert, popovers in the
 * top layer included, so while one is open the stack is moved inside the topmost modal (it
 * still renders against the viewport from the top layer) and back out when that modal closes
 * or leaves the page. Hidden, the popover is `display: none` and adds nothing to the page.
 */
@Component({
  selector: 'app-alert-snack',
  templateUrl: './alert-snack.html',
  styleUrl: './alert-snack.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
})
export class AlertSnack {
  private readonly alertService = inject(AlertService);
  private readonly insets = inject(LayoutInsets);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly alerts = this.alertService.alerts;
  readonly eyebrows = ALERT_EYEBROWS;
  /** Clear of the fixed mobile navigation. */
  readonly inset = computed(() => `${this.insets.bottom()}px`);

  private readonly stack = viewChild.required<ElementRef<HTMLElement>>('stack');
  /** Why each card's clock is stopped: the pointer is on it, focus is in it, or both. */
  private readonly holds = new Map<number, Set<'pointer' | 'focus'>>();
  /** The newest alert already raised, so a replacement or a new card raises the stack again. */
  private raisedId = 0;
  /** Watches for the modal holding the stack leaving the page without closing. */
  private removal: MutationObserver | null = null;

  constructor() {
    afterRenderEffect(() => {
      const alerts = this.alerts();
      const ids = new Set(alerts.map((alert) => alert.id));
      for (const id of [...this.holds.keys()]) if (!ids.has(id)) this.holds.delete(id);
      const newest = alerts.at(-1)?.id ?? 0;
      if (!alerts.length) this.hide();
      else if (newest > this.raisedId) this.raise();
      this.raisedId = Math.max(this.raisedId, newest);
    });
    // A modal opening while cards show takes them in; one closing lets them out again.
    const moved = (event: Event) => {
      if (event.target instanceof HTMLDialogElement && this.alerts().length) this.raise();
      else if (event.target instanceof HTMLDialogElement) this.park();
    };
    document.addEventListener('toggle', moved, true);
    document.addEventListener('close', moved, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('toggle', moved, true);
      document.removeEventListener('close', moved, true);
      this.removal?.disconnect();
      // A stack moved into a modal is not removed with this component's view.
      this.stack().nativeElement.remove();
    });
  }

  dismiss(id: number): void {
    this.alertService.dismiss(id);
  }

  act(alert: Alert): void {
    alert.action?.run();
    this.alertService.dismiss(alert.id);
  }

  /** Hovering or focusing a card stops its clock; leaving both restarts it. */
  hold(id: number, reason: 'pointer' | 'focus', on: boolean): void {
    const reasons = this.holds.get(id) ?? new Set<'pointer' | 'focus'>();
    const held = reasons.size > 0;
    if (on) reasons.add(reason);
    else reasons.delete(reason);
    if (reasons.size) this.holds.set(id, reasons);
    else this.holds.delete(id);
    if (!held && reasons.size) this.alertService.pause(id);
    if (held && !reasons.size) this.alertService.resume(id);
  }

  focusLeft(id: number, event: FocusEvent): void {
    const card = event.currentTarget as HTMLElement;
    if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
    this.hold(id, 'focus', false);
  }

  /** Shows the stack at the top of the top layer, inside the topmost modal while one is open. */
  private raise(): void {
    const stack = this.stack().nativeElement;
    if (typeof stack.showPopover !== 'function') {
      // No Popover API: a plain fixed block.
      stack.classList.add('fallback');
      return;
    }
    const parent = this.topModal() ?? this.host;
    if (stack.parentElement !== parent) parent.append(stack);
    this.watchRemoval(parent !== this.host);
    try {
      if (stack.matches(':popover-open')) stack.hidePopover();
      stack.showPopover();
    } catch {
      stack.classList.add('fallback');
    }
  }

  private hide(): void {
    const stack = this.stack().nativeElement;
    stack.classList.remove('fallback');
    try {
      if (stack.matches(':popover-open')) stack.hidePopover();
    } catch {
      // Without the Popover API there is nothing to hide: the empty block shows nothing.
    }
  }

  /** With no cards showing, a modal closing or leaving takes the hidden stack back home. */
  private park(): void {
    const stack = this.stack().nativeElement;
    if (stack.parentElement !== this.host) this.host.append(stack);
    this.watchRemoval(false);
  }

  private topModal(): HTMLDialogElement | null {
    try {
      const modals = document.querySelectorAll<HTMLDialogElement>('dialog:modal');
      return modals.length ? modals[modals.length - 1] : null;
    } catch {
      return null;
    }
  }

  private watchRemoval(inModal: boolean): void {
    if (!inModal) {
      this.removal?.disconnect();
      this.removal = null;
      return;
    }
    if (this.removal) return;
    this.removal = new MutationObserver(() => {
      if (this.stack().nativeElement.isConnected) return;
      if (this.alerts().length) this.raise();
      else this.park();
    });
    this.removal.observe(document.body, { childList: true, subtree: true });
  }
}
