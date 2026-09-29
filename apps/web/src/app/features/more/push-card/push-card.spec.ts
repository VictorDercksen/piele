import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AlertService } from '../../../core/feedback/alert.service';
import { LeagueContext } from '../../../core/league/league-context';
import { PushControlService } from '../../../core/push/push-control.service';
import { PushCategory, PushState } from '../../../core/push/push.models';
import { PushService } from '../../../core/push/push.service';
import { PushCard } from './push-card';

describe('PushCard', () => {
  function setup(initial: PushState, kinds: readonly PushCategory[] | null = ['cases']) {
    const state = signal<PushState>(initial);
    const muted = signal<readonly PushCategory[] | null>(kinds);
    const control = {
      refresh: vi.fn(() => Promise.resolve()),
      loadKinds: vi.fn(() => {
        muted.set([]);
        return Promise.resolve();
      }),
      turnOn: vi.fn(() => {
        state.set('on');
        return Promise.resolve(true);
      }),
      turnOff: vi.fn(() => {
        state.set('off');
        return Promise.resolve();
      }),
      setKind: vi.fn(() => Promise.reject(new Error('Offline'))),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PushService,
          useValue: {
            state,
            muted,
            canChooseKinds: computed(() => state() === 'on'),
            isOn: (category: PushCategory) => !(muted() ?? []).includes(category),
          },
        },
        { provide: PushControlService, useValue: control },
        { provide: LeagueContext, useValue: { name: signal('Piele') } },
      ],
    });
    const fixture = TestBed.createComponent(PushCard);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    return { fixture, root, control, state, button, alerts: TestBed.inject(AlertService) };
  }

  it('explains the Home Screen step on iPhone', () => {
    const { root, control } = setup('install');
    expect(control.refresh).toHaveBeenCalled();
    expect(root.textContent).toContain('Add to Home Screen');
    expect(root.querySelector('button')).toBeNull();
  });

  it('turns notifications on, shows the league kinds, and turns them off', async () => {
    const { fixture, root, control, button, alerts } = setup('off');
    const success = vi.spyOn(alerts, 'success');
    button('Turn on notifications')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(control.turnOn).toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith('Notifications are on for this device.', {
      key: 'push-card',
    });
    expect(root.textContent).toContain('Choose what Piele sends.');
    const switches = Array.from(root.querySelectorAll('[role="switch"]'));
    expect(switches).toHaveLength(4);
    expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'true',
      'false',
    ]);
    button('Turn off on this device')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(control.turnOff).toHaveBeenCalled();
    expect(button('Turn on notifications')).toBeDefined();
  });

  it('loads the league kinds once push is on', () => {
    const { control, fixture } = setup('on', null);
    fixture.detectChanges();
    expect(control.loadKinds).toHaveBeenCalledTimes(1);
  });

  it('reports a kind that was not saved', async () => {
    const { fixture, alerts } = setup('on');
    const error = vi.spyOn(alerts, 'error');
    await fixture.componentInstance.setKind('picks', false);
    expect(error).toHaveBeenCalledWith('That change was not saved. Offline', { key: 'push-card' });
  });
});
