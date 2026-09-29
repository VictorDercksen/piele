import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LeagueContext } from '../league/league-context';
import { PushClient } from './push-client';
import { PushCategory, PushPreferences } from './push.models';
import { PushService } from './push.service';

describe('PushService', () => {
  function setup(
    device: Partial<{ configured: boolean; supported: boolean; needsInstall: boolean }> = {},
  ) {
    const client = {
      configured: true,
      supported: true,
      needsInstall: false,
      ...device,
      permission: signal<NotificationPermission>('default'),
      subscribed: signal<boolean | null>(null),
      preferences: signal<PushPreferences | null>(null),
    };
    const current = signal<{ id: string } | null>({ id: 'league-1' });
    const member = signal(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: PushClient, useValue: client },
        { provide: LeagueContext, useValue: { current, isMemberOfCurrent: member } },
      ],
    });
    return { push: TestBed.inject(PushService), client, current, member };
  }

  it('says what the device can do', () => {
    expect(setup({ configured: false }).push.state()).toBe('unconfigured');
    TestBed.resetTestingModule();
    expect(setup({ supported: false, needsInstall: true }).push.state()).toBe('install');
    TestBed.resetTestingModule();
    expect(setup({ supported: false }).push.state()).toBe('unsupported');
    TestBed.resetTestingModule();
    const { push, client } = setup();
    expect(push.state()).toBe('checking');
    client.subscribed.set(false);
    expect(push.state()).toBe('off');
    client.subscribed.set(true);
    expect(push.state()).toBe('on');
    client.permission.set('denied');
    expect(push.state()).toBe('denied');
  });

  it('reads the muted kinds of the current league only, and not for the admin outside it', () => {
    const { push, client, current, member } = setup();
    client.subscribed.set(true);
    expect(push.canChooseKinds()).toBe(true);
    expect(push.muted()).toBeNull();
    client.preferences.set({ leagueId: 'league-1', muted: ['picks'] as PushCategory[] });
    expect(push.isOn('picks')).toBe(false);
    expect(push.isOn('matches')).toBe(true);
    current.set({ id: 'league-2' });
    expect(push.muted()).toBeNull();
    member.set(false);
    expect(push.canChooseKinds()).toBe(false);
  });
});
