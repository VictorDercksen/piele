import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideLocateFixed } from '@ng-icons/lucide';
import { CompetitionRound } from '../../competition/competition.models';
import { CaseService } from '../../league/cases/case.service';
import { DutyService } from '../../league/duties/duty.service';
import { PollService } from '../../league/polls/poll.service';
import { Icon } from '../../../shared/icon/icon';
import { DUTY_STATE_LABELS, roundActivity, roundLabel } from './round-activity';

@Component({
  selector: 'app-season-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.sheet]': "presentation() === 'sheet'" },
  template: ` <nav class="season-timeline" aria-label="Season timeline">
    <div class="timeline-heading">
      <img class="season-logo" [src]="emblem()" [alt]="competitionName()" /><strong>{{
        season()
      }}</strong>
      @if (selected() !== current()) {
        <button hlmBtn type="button" class="current-link" (click)="confirm(current())">
          Current round<ng-icon class="link-icon" name="lucideLocateFixed" />
        </button>
      }
    </div>
    <div #track class="round-track">
      @for (round of rounds(); track round.id) {
        <button
          hlmBtn
          #stop
          class="round-stop"
          [class.selected]="selected() === round.id"
          [class.completed]="round.status === 'Completed'"
          [class.current]="round.id === current()"
          [attr.aria-pressed]="selected() === round.id"
          [attr.aria-label]="label(round)"
          (click)="confirm(round.id)"
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
            ><span
              hlmBadge
              variant="outline"
              class="round-status"
              [attr.data-status]="round.status"
              >{{ round.status }}</span
            ></span
          >
          @if (activity().get(round.id); as marks) {
            <span class="round-marks" aria-hidden="true">
              @if (marks.duty) {
                <span class="round-mark" [attr.data-duty]="marks.duty"
                  ><app-icon name="duties" /><span class="mark-word">{{
                    dutyLabels[marks.duty]
                  }}</span></span
                >
              }
              @if (marks.decisions) {
                <span class="round-mark" data-kind="decisions"
                  ><app-icon name="decisions" /><span class="mark-count">{{
                    marks.decisions
                  }}</span></span
                >
              }
            </span>
          }
        </button>
      }
    </div>
    <p class="timeline-foot">{{ regularRounds() }} rounds. The playoffs.<br />One clubhouse.</p>
  </nav>`,
  styleUrl: './season-timeline.scss',
  /* prettier-ignore */
  imports: [
    NgIcon,
    HlmBadge,
    HlmButton,
    Icon,
  ],
  viewProviders: [provideIcons({ lucideCheck, lucideLocateFixed })],
})
export class SeasonTimeline {
  private readonly duties = inject(DutyService);
  private readonly cases = inject(CaseService);
  private readonly polls = inject(PollService);
  readonly presentation = input<'rail' | 'sheet'>('rail');
  readonly current = input(1);
  /** `26 / 27`. */
  readonly season = input.required<string>();
  /** The competition's logo, shown before the season. */
  readonly emblem = input.required<string>();
  readonly competitionName = input.required<string>();
  readonly regularRounds = input.required<number>();
  readonly rounds = input.required<readonly CompetitionRound[]>();
  readonly selected = input.required<number>();
  readonly choose = output<number>();
  readonly confirmed = output<void>();
  readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  readonly stops = viewChildren<ElementRef<HTMLElement>>('stop');
  /** The member's duty and the unresolved decisions of each round. */
  readonly activity = computed(() =>
    roundActivity(this.duties.seasonDuties(), this.cases.seasonCases(), this.polls.seasonPolls()),
  );
  readonly dutyLabels = DUTY_STATE_LABELS;
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
  label(round: CompetitionRound): string {
    return roundLabel(round, this.activity().get(round.id));
  }

  confirm(id: number): void {
    this.choose.emit(id);
    this.confirmed.emit();
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
