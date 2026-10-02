import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmphasisText } from './emphasis-text';

@Component({
  selector: 'app-emphasis-host',
  template: `<p><app-emphasis-text [text]="text" /></p>`,
  imports: [EmphasisText],
})
class Host {
  text = 'Apply **Addendum A, A1**.';
}

describe('EmphasisText', () => {
  it('renders bold spans as strong without extra spaces', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toBe('Apply Addendum A, A1.');
    expect(root.querySelector('strong')?.textContent).toBe('Addendum A, A1');
  });
});
