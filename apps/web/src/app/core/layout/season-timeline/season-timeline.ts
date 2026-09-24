import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideLocateFixed } from '@ng-icons/lucide';
import { CompetitionRound } from '../../competition/competition.models';

@Component({
  selector: 'app-season-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <nav class="season-timeline" aria-label="Season timeline">
    <div class="timeline-heading">
      <span>THE SEASON</span><strong>26 / 27</strong
      ><button type="button" class="current-link" (click)="choose.emit(current())">
        Current round<ng-icon class="link-icon" name="lucideLocateFixed" />
      </button>
    </div>
    <div #track class="round-track">
      @for (round of rounds(); track round.id) {
        <button
          #stop
          class="round-stop"
          [class.selected]="selected() === round.id"
          [class.completed]="round.status === 'Completed'"
          [class.current]="round.id === current()"
          [attr.aria-pressed]="selected() === round.id"
          [attr.aria-label]="round.title + ', ' + round.status"
          (click)="choose.emit(round.id)"
          (keydown)="move($event, round.id)"
        >
          <span class="round-node">
            @if (round.status === 'Completed') {
              <ng-icon name="lucideCheck" />
            } @else {
              {{ round.code }}
            }</span
          ><span class="round-label"
            ><strong>{{ round.title }}</strong
            ><small>{{ round.dates.replace(' 2026', '').replace(' 2027', '') }}</small
            ><em>{{ round.status }}</em></span
          >
        </button>
      }
    </div>
    <p class="timeline-foot">18 rounds. The playoffs.<br />One clubhouse.</p>
  </nav>`,
  styleUrl: './season-timeline.scss',
  imports: [NgIcon],
  viewProviders: [provideIcons({ lucideCheck, lucideLocateFixed })],
})
export class SeasonTimeline {
  readonly current = input(1);
  readonly rounds = input.required<readonly CompetitionRound[]>();
  readonly selected = input.required<number>();
  readonly choose = output<number>();
  readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  readonly stops = viewChildren<ElementRef<HTMLElement>>('stop');
  constructor() {
    afterRenderEffect(() => {
      const selected = this.stops()[this.selected() - 1]?.nativeElement;
      const track = this.track().nativeElement;
      if (!selected) return;
      track.scrollLeft =
        selected.offsetLeft - track.offsetLeft - (track.clientWidth - selected.clientWidth) / 2;
      track.scrollTop =
        selected.offsetTop - track.offsetTop - (track.clientHeight - selected.clientHeight) / 2;
    });
  }
  move(event: KeyboardEvent, id: number): void {
    const next =
      event.key === 'Home'
        ? 1
        : event.key === 'End'
          ? this.rounds().length
          : ['ArrowDown', 'ArrowRight'].includes(event.key)
            ? Math.min(this.rounds().length, id + 1)
            : ['ArrowUp', 'ArrowLeft'].includes(event.key)
              ? Math.max(1, id - 1)
              : 0;
    if (!next) return;
    event.preventDefault();
    this.choose.emit(next);
    const track = (event.currentTarget as HTMLElement).parentElement;
    (track?.children[next - 1] as HTMLElement)?.focus();
  }
}
