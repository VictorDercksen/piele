import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideChevronsUpDown } from '@ng-icons/lucide';
import { filter, map } from 'rxjs';
import { CompetitionService, shortSeason } from '../../competition/competition.service';
import { joinCodeFrom } from '../../league/join.service';
import { LeagueContext } from '../../league/league-context';
import { LeagueSummary } from '../../league/league.models';
import { Icon } from '../../../shared/icon/icon';
import { LeagueCrest } from '../../../shared/league-crest/league-crest';

let nextId = 0;

/**
 * The top-left block: the current league's crest, name, competition and season, and the
 * button that opens the league switcher. The switcher lists the account's leagues (grouped
 * for the admin), opens the same page in another league, takes a join link or code and, for
 * the admin, ends with "Manage leagues" (`/manage`). Built
 * like the notifications flag: a local `open` signal, Escape and outside-pointer close, focus
 * back on the button. A popover on wide screens, a sheet under the top bar on phones.
 */
@Component({
  selector: 'app-league-switcher',
  templateUrl: './league-switcher.html',
  styleUrl: './league-switcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LeagueCrest, Icon, NgIcon],
  viewProviders: [provideIcons({ lucideArrowRight, lucideChevronsUpDown })],
  host: {
    '[class.open]': 'open()',
    '[class.rail]': "variant() === 'rail'",
    '(document:keydown.escape)': 'onEscape()',
    '(document:pointerdown)': 'onPointerDown($event)',
  },
})
export class LeagueSwitcher {
  private readonly router = inject(Router);
  private readonly context = inject(LeagueContext);
  private readonly competition = inject(CompetitionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Where it sits: the desktop season rail or the top bar. Only changes the styling. */
  readonly variant = input<'rail' | 'bar'>('bar');
  readonly id = `league-switcher-${nextId++}`;
  readonly open = signal(false);

  readonly league = this.context.current;
  readonly name = this.context.name;
  /** `URC 26 / 27`. */
  readonly competitionLine = computed(
    () => `${this.competition.shortName} ${shortSeason(this.competition.season, ' / ')}`,
  );
  readonly triggerLabel = computed(() => `${this.name()}. Switch league`);
  /** The admin's last item: the management centre. */
  readonly isAdmin = this.context.isAdmin;

  /** The account's leagues; the admin's split into its own and the rest. */
  readonly groups = computed<readonly LeagueGroup[]>(() => {
    const leagues = this.context.leagues();
    if (!this.context.isAdmin()) return [{ title: null, leagues }];
    return [
      { title: 'Your leagues', leagues: leagues.filter((league) => !!league.memberId) },
      { title: 'All leagues', leagues: leagues.filter((league) => !league.memberId) },
    ].filter((group) => group.leagues.length);
  });

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Where each league's row goes: the same page under its slug. The round stays only between
   * leagues on the same competition, and a match page of another competition opens the home.
   */
  readonly targets = computed(() => {
    const url = this.url();
    const current = this.league();
    const path = this.context.within(url);
    const round = this.router.parseUrl(url).queryParams['round'];
    const targets = new Map<string, LeagueTarget>();
    for (const league of this.context.leagues()) {
      const same = current?.competition.id === league.competition.id;
      const page = !same && path.startsWith('/match/') ? '/' : path;
      targets.set(league.id, {
        path: this.context.url(page, league.slug),
        queryParams: same && round ? { round } : {},
      });
    }
    return targets;
  });

  private readonly codeInput = viewChild.required<ElementRef<HTMLInputElement>>('codeInput');
  readonly joinInvalid = signal(false);

  toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  show(): void {
    this.joinInvalid.set(false);
    this.open.set(true);
    afterNextRender(
      () => {
        const panel = this.panel()?.nativeElement;
        const row =
          panel?.querySelector<HTMLElement>('[aria-current="true"]') ??
          panel?.querySelector<HTMLElement>('a, button');
        row?.focus();
      },
      { injector: this.injector },
    );
  }

  /** Closes and puts focus back on the button. */
  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }

  target(league: LeagueSummary): LeagueTarget {
    return this.targets().get(league.id) ?? { path: `/${league.slug}`, queryParams: {} };
  }

  /** `URC 2026/27`, with the competition's short name when the season name leaves it out. */
  seasonLine(league: LeagueSummary): string {
    const short = league.competition.shortName;
    return league.seasonName.startsWith(short) ? league.seasonName : `${short} · ${league.seasonName}`;
  }

  isCurrent(league: LeagueSummary): boolean {
    return league.id === this.league()?.id;
  }

  /** A plain form (no forms module in the shell's bundle): one field, read on submit. */
  join(event: Event): void {
    event.preventDefault();
    const input = this.codeInput().nativeElement;
    const code = joinCodeFrom(input.value);
    this.joinInvalid.set(!code);
    if (!code) return;
    input.value = '';
    this.close();
    void this.router.navigate(['/join', code]);
  }

  onEscape(): void {
    this.close();
  }

  onPointerDown(event: Event): void {
    if (this.open() && !event.composedPath().includes(this.host.nativeElement))
      this.open.set(false);
  }
}

interface LeagueGroup {
  readonly title: string | null;
  readonly leagues: readonly LeagueSummary[];
}

interface LeagueTarget {
  readonly path: string;
  readonly queryParams: Params;
}
