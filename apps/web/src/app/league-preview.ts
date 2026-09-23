import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { SEASON_ROUNDS } from './season-preview';
import { COMPETITION_ROUNDS, CURRENT_ROUND } from './competition-season';
import { ProfileStore } from './profile/profile-store';
import { jersey } from './teams';
import { SeasonTimeline } from './season-timeline';
import { Concept } from './concepts';
import { Icon } from './icon';
import { MatchHero } from './match-hero';

@Component({
  selector: 'app-league-preview',
  templateUrl: './league-preview.html',
  styleUrls: [
    './league-preview.scss',
    './rugby-shell.scss',
    './round-workspace.scss',
    './member-identity.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, MatchHero, SeasonTimeline],
})
export class LeaguePreview {
  private readonly profileStore = inject(ProfileStore);
  readonly profile = this.profileStore.profile;
  readonly favouriteTeam = this.profileStore.team;
  readonly initials = this.profileStore.initials;
  readonly editProfile = output<void>();
  readonly jersey = jersey;
  readonly demo = new URLSearchParams(window.location.search).get('demo') === '1';
  readonly currentRound = this.demo ? 3 : CURRENT_ROUND;
  readonly concept = input.required<Concept>();
  readonly captain = input(false);
  readonly page = signal<Page>('home');
  readonly panel = signal<Panel>('evidence');
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('detailDialog');
  readonly nav = [
    { id: 'home', label: 'Home' },
    { id: 'rounds', label: 'Rounds' },
    { id: 'standings', label: 'Standings' },
    { id: 'duties', label: 'Duties' },
    { id: 'decisions', label: 'Decisions' },
  ] as const;
  readonly mobileNav = [
    { id: 'home', label: 'Home' },
    { id: 'rounds', label: 'Rounds' },
    { id: 'duties', label: 'Duties' },
    { id: 'decisions', label: 'Decisions' },
    { id: 'more', label: 'More' },
  ] as const;
  readonly rounds = this.demo ? SEASON_ROUNDS : COMPETITION_ROUNDS;
  readonly selectedRound = signal(this.initialRound());
  readonly round = computed(() => this.rounds[this.selectedRound() - 1]);
  readonly members = computed(() => this.round().members);
  readonly fixtures = computed(() => this.round().fixtures);
  readonly myDuty = computed(() =>
    this.round().duties.find((duty) => duty.member === 'Victor Dercksen'),
  );
  readonly ownMarks = computed(
    () => this.round().members.find((member) => member.initials === 'VD')?.marks ?? 0,
  );
  readonly submissions = signal<Record<number, boolean>>({});
  readonly submitted = computed(() => !!this.submissions()[this.selectedRound()]);
  readonly votes = signal<Record<number, string>>({});
  readonly recordedVote = computed(() => this.votes()[this.selectedRound()] ?? '');
  readonly fileName = signal('');
  readonly fileError = signal('');
  readonly vote = signal('');
  readonly dutyFilter = signal<'mine' | 'league'>('mine');
  readonly standingsType = signal<'points' | 'marks'>('points');
  readonly toast = signal('');
  readonly title = computed(
    () =>
      ({
        home: 'Your clubhouse.',
        rounds: 'The weekend line-up.',
        standings: 'The pecking order.',
        duties: 'The duty register.',
        decisions: 'Have your say.',
        more: 'Around the club.',
      })[this.page()],
  );
  readonly visibleDuties = computed(() =>
    this.dutyFilter() === 'mine'
      ? this.round().duties.filter((duty) => duty.member === 'Victor Dercksen')
      : this.round().duties,
  );
  selectRound(id: number): void {
    if (!Number.isInteger(id) || id < 1 || id > this.rounds.length) return;
    this.selectedRound.set(id);
    this.toast.set('');
    this.fileName.set('');
    this.fileError.set('');
    this.vote.set(this.recordedVote());
    const url = new URL(window.location.href);
    url.searchParams.set('round', String(id));
    window.history.replaceState(null, '', url);
  }
  private initialRound(): number {
    const value = Number(new URLSearchParams(window.location.search).get('round'));
    return Number.isInteger(value) && value >= 1 && value <= this.rounds.length
      ? value
      : this.currentRound;
  }
  go(page: Page): void {
    this.page.set(page);
    this.toast.set('');
  }
  open(panel: Panel): void {
    if (panel === 'evidence' && (!this.myDuty() || this.myDuty()?.status === 'Completed')) return;
    if (panel === 'vote' && this.round().poll?.status !== 'Open') return;
    if (panel === 'vote') this.vote.set(this.recordedVote());
    this.panel.set(panel);
    this.toast.set('');
    this.dialog().nativeElement.showModal();
  }
  close(): void {
    this.dialog().nativeElement.close();
  }
  pickFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.fileName.set('');
    this.fileError.set('');
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      this.fileError.set('Choose a video file to continue.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.fileError.set('For this preview, choose a video smaller than 50 MB.');
      return;
    }
    this.fileName.set(file.name);
  }
  submitEvidence(): void {
    if (!this.fileName() || !this.myDuty()) return;
    this.submissions.update((value) => ({ ...value, [this.selectedRound()]: true }));
    this.close();
    this.toast.set('Demo evidence submitted for review. No file was uploaded.');
  }
  castVote(): void {
    if (!this.vote() || this.round().poll?.status !== 'Open') return;
    this.votes.update((value) => ({ ...value, [this.selectedRound()]: this.vote() }));
    this.close();
    this.toast.set('Your demo vote is recorded. It will reset when you reload.');
  }
}

type Page = 'home' | 'rounds' | 'standings' | 'duties' | 'decisions' | 'more';

type Panel = 'evidence' | 'vote' | 'notifications' | 'constitution' | 'review';
