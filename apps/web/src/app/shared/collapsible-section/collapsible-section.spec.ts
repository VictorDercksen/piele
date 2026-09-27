import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CollapsibleSection } from './collapsible-section';

@Component({
  template: `<app-collapsible-section
    heading="Superbru picks."
    headingId="picks-heading"
    [anchor]="anchor()"
  >
    <span class="tag" sectionSide>2 PENDING</span>
    <p class="content">The picks.</p>
  </app-collapsible-section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CollapsibleSection],
})
class Host {
  readonly anchor = signal('');
}

describe('CollapsibleSection', () => {
  function setup(fragment: string | null = null) {
    const fragments = new BehaviorSubject<string | null>(fragment);
    TestBed.configureTestingModule({
      providers: [{ provide: ActivatedRoute, useValue: { fragment: fragments } }],
    });
    const fixture = TestBed.createComponent(Host);
    const root: HTMLElement = fixture.nativeElement;
    const settle = async () => {
      TestBed.tick();
      await fixture.whenStable();
    };
    return { fixture, root, fragments, settle };
  }

  it('is closed by default and opens and closes from the chevron', async () => {
    const { root, settle } = setup();
    await settle();
    const section = root.querySelector('section')!;
    const chevron = root.querySelector<HTMLButtonElement>('.section-title .chevron')!;
    const body = root.querySelector('#picks-heading-body')!;
    expect(root.querySelector('h2')!.id).toBe('picks-heading');
    expect(section.getAttribute('aria-labelledby')).toBe('picks-heading');
    expect(section.classList).not.toContain('open');
    expect(chevron.getAttribute('aria-labelledby')).toBe('picks-heading');
    expect(chevron.getAttribute('aria-controls')).toBe('picks-heading-body');
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    expect(body.hasAttribute('inert')).toBe(true);
    expect(body.querySelector('.content')).not.toBeNull();
    // Content marked sectionSide sits in the heading row, beside the chevron.
    expect(root.querySelector('.title-side .tag')?.textContent).toBe('2 PENDING');

    chevron.click();
    await settle();
    expect(section.classList).toContain('open');
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(body.hasAttribute('inert')).toBe(false);

    chevron.click();
    await settle();
    expect(section.classList).not.toContain('open');
    expect(body.hasAttribute('inert')).toBe(true);
  });

  it('takes its anchor as its id and opens when the fragment names it', async () => {
    const { fixture, root, fragments, settle } = setup('picks');
    await settle();
    const host = root.querySelector('app-collapsible-section')!;
    expect(host.hasAttribute('id')).toBe(false);
    expect(root.querySelector('section')!.classList).not.toContain('open');

    fixture.componentInstance.anchor.set('picks');
    await settle();
    expect(host.id).toBe('picks');
    expect(root.querySelector('section')!.classList).toContain('open');

    root.querySelector<HTMLButtonElement>('.chevron')!.click();
    await settle();
    expect(root.querySelector('section')!.classList).not.toContain('open');
    fragments.next('rules');
    await settle();
    expect(root.querySelector('section')!.classList).not.toContain('open');
    fragments.next('picks');
    await settle();
    expect(root.querySelector('section')!.classList).toContain('open');
  });
});
