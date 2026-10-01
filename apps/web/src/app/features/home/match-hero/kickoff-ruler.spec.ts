import { competition } from '../../../core/competition/registry';
import { MemberPick, PickSide } from '../../../core/league/league.models';
import { kickoffRuler } from './kickoff-ruler';

const URC = competition('urc-2026-27');
const ROUND_3 = URC.buildRounds(3).find((round) => round.id === 3)!.fixtures;
/** Thursday 8 October 2026, 19:00 SAST, before the round. */
const THURSDAY = Date.parse('2026-10-08T17:00:00Z');
/** Saturday 10 October 2026, 10:00 SAST, after Friday's kickoffs. */
const SATURDAY = Date.parse('2026-10-10T08:00:00Z');
const GLASGOW_CONNACHT = '292600';
const DRAGONS_OSPREYS = '292601';
const BULLS_LIONS = '292602';
const STORMERS_SHARKS = '292603';
const ZEBRE_EDINBURGH = '292604';
const SCARLETS_BENETTON = '292605';

function pick(side: PickSide, margin: number | null, isDefault = false): MemberPick {
  return { memberId: 'member-me', memberName: 'Me', side, margin, isDefault, dutyId: null };
}

function picks(record: Record<string, MemberPick>) {
  return (fixtureId: string) => record[fixtureId] ?? null;
}

describe('kickoffRuler', () => {
  it('lays the picks along the kickoffs with the pin before the first', () => {
    const ruler = kickoffRuler(
      ROUND_3,
      picks({
        [GLASGOW_CONNACHT]: pick('home', 7),
        [DRAGONS_OSPREYS]: pick('away', 5),
        [BULLS_LIONS]: pick('home', 12),
        [STORMERS_SHARKS]: pick('draw', 0),
        [ZEBRE_EDINBURGH]: pick('away', 10, true),
      }),
      URC,
      THURSDAY,
    )!;
    expect(ruler.total).toBe(8);
    expect(ruler.made).toBe(5);
    expect(ruler.open).toBe(3);
    expect(ruler.missed).toBe(0);
    expect(ruler.now).toEqual({ day: 'THU', time: '19:00' });
    expect(ruler.pin).toBe(0);
    expect(ruler.slots.map((slot) => `${slot.day} ${slot.time}`)).toEqual([
      'FRI 20:45',
      'SAT 13:30',
      'SAT 16:00',
      'SAT 18:30',
      'SAT 20:45',
    ]);
    expect(ruler.slots.map((slot) => slot.dots.length)).toEqual([2, 1, 2, 2, 1]);
    expect(ruler.slots.map((slot) => slot.open)).toEqual([false, false, false, true, true]);

    const glasgow = ruler.slots[0].dots[0];
    expect(glasgow).toEqual({
      fixtureId: GLASGOW_CONNACHT,
      state: 'picked',
      colour: '#193d55',
      crest: URC.banners['glasgow-warriors'].crest,
      label: 'Glasgow v Connacht: Glasgow by 7',
    });
    expect(ruler.slots[2].dots[0]).toMatchObject({
      state: 'picked',
      colour: null,
      crest: null,
      label: 'Stormers v Sharks: Draw',
    });
    expect(ruler.slots[2].dots[1].label).toBe('Zebre v Edinburgh: Edinburgh by 10 (default)');
    expect(ruler.slots[3].dots[0]).toEqual({
      fixtureId: SCARLETS_BENETTON,
      state: 'open',
      colour: null,
      crest: null,
      label: 'Scarlets v Benetton: no pick yet, locks SAT 18:30',
    });
  });

  it('moves the pin past kickoffs and counts a locked fixture without a pick as missed', () => {
    const ruler = kickoffRuler(
      ROUND_3,
      picks({ [GLASGOW_CONNACHT]: pick('home', 7), [BULLS_LIONS]: pick('missed', null) }),
      URC,
      SATURDAY,
    )!;
    expect(ruler.pin).toBe(1);
    expect(ruler.now).toEqual({ day: 'SAT', time: '10:00' });
    expect(ruler.made).toBe(1);
    expect(ruler.missed).toBe(2);
    expect(ruler.open).toBe(5);
    expect(ruler.slots[0].open).toBe(false);
    expect(ruler.slots[0].dots[1]).toMatchObject({
      state: 'missed',
      label: 'Dragons v Ospreys: no pick',
    });
    expect(ruler.slots[1].dots[0]).toMatchObject({
      state: 'missed',
      label: 'Bulls v Lions: no pick',
    });
  });

  it('puts fixtures without a kickoff in a trailing TBC slot that never locks', () => {
    const unknown = { ...ROUND_3[7], id: 'tbc-1', kickoffUtc: null };
    const ruler = kickoffRuler([unknown, ...ROUND_3.slice(0, 2)], picks({}), URC, SATURDAY)!;
    expect(ruler.slots.map((slot) => slot.key)).toEqual([
      String(Date.parse(ROUND_3[0].kickoffUtc!)),
      'tbc',
    ]);
    expect(ruler.slots[1]).toMatchObject({ day: 'TBC', time: '', open: true });
    expect(ruler.slots[1].dots[0]).toMatchObject({
      state: 'open',
      label: 'Leinster v Cardiff: no pick yet',
    });
    expect(ruler.pin).toBe(1);
  });

  it('is null for a round without fixtures', () => {
    expect(kickoffRuler([], picks({}), URC, THURSDAY)).toBeNull();
  });
});
