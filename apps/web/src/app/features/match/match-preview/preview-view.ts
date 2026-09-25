import { MatchPreview, PreviewFactor } from '../../../core/api/match-centre.models';
import { CLUB_BANNERS } from '../../../core/competition/club-banners';
import { club } from '../../../core/competition/teams';

export type MoodTone = 'down' | 'level' | 'up';

export interface PreviewSideView {
  readonly label: string;
  /** Club colours and artwork, when the club is known. */
  readonly accent: string | undefined;
  readonly colour: string | undefined;
  readonly crest: string | undefined;
  readonly pattern: string | undefined;
  readonly mood: {
    readonly label: string;
    readonly tone: MoodTone;
    /** Position on the five-step scale, 1 (troubled) to 5 (buoyant). */
    readonly step: number;
    readonly note: string;
    readonly cites: string;
  };
  readonly factors: readonly { readonly text: string; readonly cites: string }[];
}

export interface PreviewSourceView {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  /** The publisher, else the site's host name. */
  readonly origin: string;
}

export interface PreviewView {
  readonly summary: string;
  readonly generatedAt: string;
  readonly revision: number;
  readonly sides: readonly [PreviewSideView, PreviewSideView];
  readonly sources: readonly PreviewSourceView[];
}

const MOODS: Record<number, { label: string; tone: MoodTone }> = {
  [-2]: { label: 'Troubled', tone: 'down' },
  [-1]: { label: 'Unsettled', tone: 'down' },
  0: { label: 'Steady', tone: 'level' },
  1: { label: 'Positive', tone: 'up' },
  2: { label: 'Buoyant', tone: 'up' },
};

/** Display model of a preview: labelled moods and numbered source citations. */
export function previewView(
  preview: MatchPreview,
  home: string,
  away: string,
  homeClub = '',
  awayClub = '',
): PreviewView {
  const side = (label: string, key: 'home' | 'away', clubId: string): PreviewSideView => {
    const mood = preview.sentiment[key];
    const score = Math.max(-2, Math.min(2, Math.round(mood.score)));
    const banner = CLUB_BANNERS[clubId];
    const team = club(clubId);
    return {
      label,
      accent: team?.accent,
      colour: team?.colour,
      crest: banner?.crest,
      pattern: banner?.pattern,
      mood: { ...MOODS[score], step: score + 3, note: mood.note, cites: cites(mood.sources) },
      factors: preview.keyFactors[key].map((factor: PreviewFactor) => ({
        text: factor.text,
        cites: cites(factor.sources),
      })),
    };
  };
  return {
    summary: preview.summary,
    generatedAt: preview.generatedAt,
    revision: preview.revision,
    sides: [side(home, 'home', homeClub), side(away, 'away', awayClub)],
    sources: preview.sources.map((source, index) => ({
      number: index + 1,
      url: source.url,
      title: source.title,
      origin: source.publisher ?? host(source.url),
    })),
  };
}

/** Source indexes as the numbers shown in the list, e.g. `[0, 2]` as `1, 3`. */
function cites(indexes: readonly number[]): string {
  return indexes.map((index) => index + 1).join(', ');
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
