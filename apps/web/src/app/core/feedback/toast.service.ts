import { Injectable, signal } from '@angular/core';

/** A single dismissible status message shown above the page content. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal('');

  show(message: string): void {
    this.message.set(message);
  }

  clear(): void {
    this.message.set('');
  }
}
