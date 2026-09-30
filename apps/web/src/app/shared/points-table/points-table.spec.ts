import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BREAKDOWN_STORAGE_KEY } from '../../core/storage/standings-preferences';
import { PointsTable } from './points-table';
import { PointsRow, PointsScope } from './points-table.models';

function row(rank: number, change: Partial<PointsRow> = {}): PointsRow {
  return {
    memberId: `member-${rank}`,
    rank,
    name: `Member ${rank}`,
    photo: null,
    teamId: '',
    you: false,
    points: 10 - rank,
    wp: 10 - rank,
    mp: 0,
    gsp: 0,
    bp: 0,
    cap: false,
    spoon: false,
    crown: false,
    rounds: null,
    override: null,
    bar: { wp: 100 - rank * 10, mp: 0, gsp: 0, bp: 0 },
    ...change,
  };
}

@Component({
  template: `<app-points-table [rows]="rows()" [scope]="scope()" [limit]="limit()" />`,
  imports: [PointsTable],
})
class Host {
  readonly rows = signal<readonly PointsRow[]>([]);
  readonly scope = signal<PointsScope>('round');
  readonly limit = signal<number | null>(null);
}

function render(rows: readonly PointsRow[], limit: number | null, scope: PointsScope = 'round') {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.rows.set(rows);
  fixture.componentInstance.limit.set(limit);
  fixture.componentInstance.scope.set(scope);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const text = (selector: string) =>
    [...element.querySelectorAll(selector)].map((node) =>
      node.textContent!.replace(/\s+/g, ' ').trim(),
    );
  return { fixture, element, text };
}

describe('PointsTable', () => {
  beforeEach(() => localStorage.clear());

  it('draws every row without a limit, headed by its scope', () => {
    const { text } = render([row(1), row(2), row(3)], null, 'season');
    expect(text('.points-row .member-name')).toEqual(['Member 1', 'Member 2', 'Member 3']);
    expect(text('.total-head')).toEqual(['SEASON PTS']);
  });

  it('shows the top rows and pins the member beneath them when below the limit', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((rank) => row(rank, { you: rank === 6 }));
    const { element, text } = render(rows, 4);
    expect(text('.points-row .member-name')).toEqual([
      'Member 1',
      'Member 2',
      'Member 3',
      'Member 4',
      'Member 6',
    ]);
    const pinned = element.querySelectorAll('.points-row.pinned');
    expect(pinned).toHaveLength(1);
    expect(pinned[0].classList).toContain('you');
  });

  it('pins nothing when the member is inside the limit', () => {
    const rows = [1, 2, 3, 4, 5].map((rank) => row(rank, { you: rank === 2 }));
    const { element, text } = render(rows, 4);
    expect(text('.points-row .member-name')).toHaveLength(4);
    expect(element.querySelector('.points-row.pinned')).toBeNull();
  });

  it('shares the remembered breakdown choice', () => {
    localStorage.setItem(BREAKDOWN_STORAGE_KEY, '1');
    const { element } = render([row(1), row(2)], null);
    expect(element.querySelectorAll('.breakdown-bar')).toHaveLength(2);
  });
});
