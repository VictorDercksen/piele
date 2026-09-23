export type ConceptId = 'journal' | 'floodlights' | 'matchday';
export const CONCEPTS = [
  {
    id: 'journal' as const,
    code: 'O1',
    name: 'Club Journal',
    label: 'The match programme. Reimagined.',
    description:
      'A collectible rugby programme with a monochrome action cover, serif headlines, admission-ticket details and warm uncoated paper.',
    detail:
      'A horizontal club masthead leads into the Touchline cover. Fixtures become tickets, duties become post-match paperwork and the league table keeps its printed-page rhythm.',
    tradeoff: 'The most editorial option. Club culture and storytelling lead the experience.',
    palette: ['#111b23', '#eeeae1', '#e74c3c'],
    headline: 'Blood. Sweat. Bragging rights.',
    kicker: 'THE TOUCHLINE EDITION',
  },
  {
    id: 'floodlights' as const,
    code: 'O2',
    name: 'Floodlights',
    label: 'You can almost hear the crowd.',
    description:
      'Rain, floodlights and close-contact rugby fill the screen. A broadcast score panel, fixture strip and sharp orange controls bring the match into the clubhouse.',
    detail:
      'Original rugby artwork anchors a full-bleed match poster. Change the featured fixture in the ribbon to update the broadcast panel.',
    tradeoff: 'The most immersive option. A bigger matchday moment before the administration.',
    palette: ['#10151a', '#263f52', '#ff705b'],
    headline: 'No quiet weekends.',
    kicker: 'BOOTS ON. LIGHTS UP.',
  },
  {
    id: 'matchday' as const,
    code: 'O3',
    name: 'Matchday',
    label: 'The jerseys. The pitch. The rivalry.',
    description:
      'A rugby team sheet with your existing jerseys on a slate pitch, chalk markings, numbered navigation and a personal supporter-kit badge.',
    detail:
      'A tactical pitch composition replaces the conventional dashboard banner. Jersey artwork and squad numbers extend through the navigation and duty slips.',
    tradeoff:
      'The most graphic option. Built from rugby kit and field markings rather than photography.',
    palette: ['#263f52', '#f3f6f8', '#e74c3c'],
    headline: 'Know your colours.',
    kicker: 'THE WEEKEND XV',
  },
];
export type Concept = (typeof CONCEPTS)[number];
