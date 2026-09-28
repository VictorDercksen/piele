import { TestBed } from '@angular/core/testing';
import { LeagueData } from '../data/league-data';
import { MemberControlService } from './member-control.service';

function setup() {
  const data = {
    addMember: vi.fn().mockResolvedValue(undefined),
    updateMember: vi.fn().mockResolvedValue(undefined),
    releaseMember: vi.fn().mockResolvedValue(undefined),
    withdrawMember: vi.fn().mockResolvedValue(undefined),
    reinstateMember: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: LeagueData, useValue: data }] });
  return { service: TestBed.inject(MemberControlService), data };
}

describe('MemberControlService', () => {
  it('addMember passes through to the league', async () => {
    const { service, data } = setup();
    await expect(
      service.addMember({ name: 'New', fullName: 'New Member', email: null }),
    ).resolves.toEqual(undefined);
    expect(data.addMember).toHaveBeenCalledWith({
      name: 'New',
      fullName: 'New Member',
      email: null,
    });
  });

  it('updateMember passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.updateMember('m-1', 'new@example.com')).resolves.toEqual(undefined);
    expect(data.updateMember).toHaveBeenCalledWith('m-1', 'new@example.com');
  });

  it('releaseMember passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.releaseMember('m-1')).resolves.toEqual(undefined);
    expect(data.releaseMember).toHaveBeenCalledWith('m-1');
  });

  it('withdrawMember passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.withdrawMember('m-1', 'Moved away')).resolves.toEqual(undefined);
    expect(data.withdrawMember).toHaveBeenCalledWith('m-1', 'Moved away');
  });

  it('reinstateMember passes through to the league', async () => {
    const { service, data } = setup();
    await expect(service.reinstateMember('m-1')).resolves.toEqual(undefined);
    expect(data.reinstateMember).toHaveBeenCalledWith('m-1');
  });
});
