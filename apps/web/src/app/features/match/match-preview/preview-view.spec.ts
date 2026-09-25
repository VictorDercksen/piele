import { MatchPreview } from '../../../core/api/match-centre.models';
import { previewView } from './preview-view';

const PREVIEW: MatchPreview = {
  revision: 2,
  generatedAt: '2026-10-09T08:00:00Z',
  summary: 'Scarlets host a Benetton side with a new 10.',
  keyFactors: {
    home: [{ text: 'Unchanged front row.', sources: [0] }],
    away: [{ text: 'New Ten starts at fly-half.', sources: [0, 1] }],
  },
  sentiment: {
    home: { score: 2, note: 'Settled camp.', sources: [0] },
    away: { score: -1, note: 'Selection questions.', sources: [1] },
  },
  sources: [
    {
      url: 'https://www.unitedrugby.com/news',
      title: 'Team news',
      publisher: 'URC',
      publishedAt: null,
    },
    {
      url: 'https://www.example.org/benetton',
      title: 'Selection',
      publisher: null,
      publishedAt: null,
    },
  ],
};

describe('preview view', () => {
  it('labels moods and numbers citations from one', () => {
    const view = previewView(PREVIEW, 'Scarlets', 'Benetton');
    expect(view.sides.map((side) => [side.label, side.mood.label, side.mood.tone])).toEqual([
      ['Scarlets', 'Buoyant', 'up'],
      ['Benetton', 'Unsettled', 'down'],
    ]);
    expect(view.sides[1].factors).toEqual([{ text: 'New Ten starts at fly-half.', cites: '1, 2' }]);
    expect(view.sides[1].mood.cites).toBe('2');
  });

  it('names each source by publisher, else by host', () => {
    const view = previewView(PREVIEW, 'Scarlets', 'Benetton');
    expect(view.sources.map((source) => [source.number, source.origin])).toEqual([
      [1, 'URC'],
      [2, 'example.org'],
    ]);
  });

  it('keeps out-of-range scores on the scale', () => {
    const preview = {
      ...PREVIEW,
      sentiment: { ...PREVIEW.sentiment, home: { ...PREVIEW.sentiment.home, score: 7 } },
    };
    expect(previewView(preview, 'A', 'B').sides[0].mood.label).toBe('Buoyant');
  });
});
