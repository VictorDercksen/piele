import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { CaseControlService } from '../../../core/league/cases/case-control.service';
import { CaseService } from '../../../core/league/cases/case.service';
import { memberRecord } from '../../../core/league/data/sample-leagues';
import { StandInReviewer } from '../../../core/league/league.models';
import { MemberService } from '../../../core/league/members/member.service';
import { StandInCard } from './stand-in-card';

describe('StandInCard', () => {
  function setup() {
    const standIn = signal<StandInReviewer>({ memberId: null, memberName: null });
    const control = {
      setStandIn: vi.fn((memberId: string | null) => {
        standIn.set({ memberId, memberName: memberId ? 'Johan' : null });
        return Promise.resolve();
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: CaseService, useValue: { standIn } },
        { provide: CaseControlService, useValue: control },
        {
          provide: MemberService,
          useValue: {
            members: signal([
              memberRecord('m-me', 'You', 'You', ''),
              memberRecord('m-jp', 'Johan', 'Johan', ''),
            ]),
            captainId: signal('m-me'),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(StandInCard);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const save = () =>
      Array.from(root.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save stand-in'),
      )!;
    return { fixture, root, control, standIn, save, alerts: TestBed.inject(AlertService) };
  }

  it('names a stand-in from the claimed members other than the captain, then clears it', async () => {
    const { fixture, root, control, save, alerts } = setup();
    const card = fixture.componentInstance;
    expect(card.options().map((o) => o.label)).toEqual(['No stand-in', 'Johan']);
    expect(root.textContent).toContain('None named');
    expect(save().disabled).toBe(true);

    card.choice.setValue('m-jp');
    fixture.detectChanges();
    expect(save().disabled).toBe(false);
    const success = vi.spyOn(alerts, 'success');
    await card.save();
    fixture.detectChanges();
    expect(control.setStandIn).toHaveBeenCalledWith('m-jp');
    expect(success).toHaveBeenCalledWith('Johan is the stand-in reviewer.', {
      key: 'captain-stand-in',
    });
    expect(root.textContent).toContain('Johan reviews vetoes that involve the captain.');
    expect(save().disabled).toBe(true);

    card.choice.setValue('');
    await card.save();
    expect(control.setStandIn).toHaveBeenLastCalledWith(null);
  });

  it('shows a refusal as an error card and keeps the choice', async () => {
    const { fixture, control, alerts } = setup();
    control.setStandIn.mockRejectedValueOnce(
      new Error('Only a member who has claimed their name can review.'),
    );
    const error = vi.spyOn(alerts, 'error');
    const card = fixture.componentInstance;
    card.choice.setValue('m-jp');
    await card.save();
    expect(error).toHaveBeenCalledWith('Only a member who has claimed their name can review.', {
      key: 'captain-stand-in',
    });
    expect(card.choice.value).toBe('m-jp');
  });

  it('follows the saved stand-in when it changes elsewhere', () => {
    const { fixture, standIn } = setup();
    standIn.set({ memberId: 'm-jp', memberName: 'Johan' });
    fixture.detectChanges();
    expect(fixture.componentInstance.choice.value).toBe('m-jp');
    expect(fixture.componentInstance.changed()).toBe(false);
  });
});
