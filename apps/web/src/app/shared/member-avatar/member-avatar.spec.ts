import { TestBed } from '@angular/core/testing';
import { MemberAvatar, monogram } from './member-avatar';

describe('monogram', () => {
  it('takes one initial per word or capitalised part', () => {
    expect(monogram('Victor Dercksen')).toBe('VD');
    expect(monogram('ian die man')).toBe('ID');
    expect(monogram('TheoLotter')).toBe('TL');
    expect(monogram('DanB97')).toBe('DB');
    expect(monogram('Wolfgodallahmeen')).toBe('W');
    expect(monogram('Steven13')).toBe('S');
    expect(monogram('  ')).toBe('?');
  });
});

describe('MemberAvatar', () => {
  function render(inputs: { name: string; photo?: string | null; teamId?: string }) {
    const fixture = TestBed.createComponent(MemberAvatar);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('prefers the photo, then the team artwork, then the monogram', () => {
    const photo = 'data:image/jpeg;base64,/9j/';
    expect(
      render({ name: 'Trokkie', photo, teamId: 'ospreys' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe(photo);
    expect(
      render({ name: 'Trokkie', teamId: 'ospreys' }).querySelector('img')?.getAttribute('src'),
    ).toBe('assets/images/teams/ospreys.png');
    const monogramOnly = render({ name: 'TheoLotter' });
    expect(monogramOnly.querySelector('img')).toBeNull();
    expect(monogramOnly.querySelector('.monogram')?.textContent?.trim()).toBe('TL');
  });
});
