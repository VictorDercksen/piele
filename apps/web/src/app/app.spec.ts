import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ProfileStore } from './profile/profile-store';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });
  it('requires a profile for first-time visitors', async () => {
    TestBed.inject(ProfileStore).profile.set(null);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('allegiance.');
    expect(fixture.nativeElement.querySelectorAll('input[type=radio]').length).toBe(16);
  });
  it('uses Floodlights for returning members', async () => {
    TestBed.inject(ProfileStore).profile.set({
      displayName: 'Test Member',
      teamId: 'dhl-stormers',
      photo: null,
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.league.floodlights')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.supporter-strip').textContent).toContain(
      'Test Member',
    );
  });
});
