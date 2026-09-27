import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Dropdown } from './dropdown';

@Component({
  template: `<app-dropdown
    heading="Superbru picks."
    headingId="picks-heading"
    [anchor]="anchor()"
    [appearance]="appearance()"
    [toggleName]="toggleName()"
    [tapToOpen]="tapToOpen()"
    [collapsible]="collapsible()"
    [peek]="peek()"
    [resetKey]="resetKey()"
  >
    <span class="tag" dropdownSide>2 PENDING</span>
    <p class="lead" dropdownLead>The split.</p>
    <p class="content">The picks.</p>
  </app-dropdown>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown],
})
class Host {
  readonly anchor = signal('');
  readonly appearance = signal<'section' | 'panel'>('section');
  readonly toggleName = signal('');
  readonly tapToOpen = signal(false);
  readonly collapsible = signal(true);
  readonly peek = signal(0);
  readonly resetKey = signal<unknown>(1);
}

describe('Dropdown', () => {
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
    const section = () => root.querySelector('section.dropdown')!;
    const chevron = () => root.querySelector<HTMLButtonElement>('.dropdown-head .chevron');
    return { fixture, host: fixture.componentInstance, root, fragments, settle, section, chevron };
  }

  it('is closed by default and opens and closes from the chevron', async () => {
    const { root, settle, section, chevron } = setup();
    await settle();
    const body = root.querySelector('#picks-heading-body')!;
    expect(root.querySelector('h2')!.id).toBe('picks-heading');
    expect(section().getAttribute('aria-labelledby')).toBe('picks-heading');
    expect(section().classList).not.toContain('open');
    expect(section().classList).not.toContain('panel');
    expect(chevron()!.getAttribute('aria-labelledby')).toBe('picks-heading');
    expect(chevron()!.getAttribute('aria-controls')).toBe('picks-heading-body');
    expect(chevron()!.getAttribute('aria-expanded')).toBe('false');
    expect(body.hasAttribute('inert')).toBe(true);
    expect(body.querySelector('.content')).not.toBeNull();
    // Side content sits beside the chevron; lead content shows outside the body.
    expect(root.querySelector('.title-side .tag')?.textContent).toBe('2 PENDING');
    expect(root.querySelector('.dropdown-lead .lead')).not.toBeNull();

    chevron()!.click();
    await settle();
    expect(section().classList).toContain('open');
    expect(chevron()!.getAttribute('aria-expanded')).toBe('true');
    expect(body.hasAttribute('inert')).toBe(false);

    chevron()!.click();
    await settle();
    expect(section().classList).not.toContain('open');
    expect(body.hasAttribute('inert')).toBe(true);
  });

  it('draws a panel and names the chevron from toggleName', async () => {
    const { host, settle, section, chevron } = setup();
    host.appearance.set('panel');
    host.toggleName.set("the pool's picks");
    await settle();
    expect(section().classList).toContain('panel');
    expect(chevron()!.hasAttribute('aria-labelledby')).toBe(false);
    expect(chevron()!.getAttribute('aria-label')).toBe("Show the pool's picks");
    chevron()!.click();
    await settle();
    expect(chevron()!.getAttribute('aria-label')).toBe("Hide the pool's picks");
  });

  it('opens from a tap anywhere when closed and closes only from the heading or lead', async () => {
    const { root, host, settle, section } = setup();
    host.tapToOpen.set(true);
    await settle();
    root.querySelector<HTMLElement>('.content')!.click();
    await settle();
    expect(section().classList).toContain('open');
    root.querySelector<HTMLElement>('.content')!.click();
    await settle();
    expect(section().classList).toContain('open');
    root.querySelector<HTMLElement>('.lead')!.click();
    await settle();
    expect(section().classList).not.toContain('open');
    root.querySelector<HTMLElement>('.lead')!.click();
    await settle();
    root.querySelector<HTMLElement>('h2')!.click();
    await settle();
    expect(section().classList).not.toContain('open');
  });

  it('has no chevron when not collapsible, and closes again for a new reset key', async () => {
    const { root, host, settle, section, chevron } = setup();
    host.peek.set(30);
    await settle();
    expect(section().classList).toContain('peeks');
    chevron()!.click();
    await settle();
    expect(section().classList).toContain('open');
    host.resetKey.set(2);
    await settle();
    expect(section().classList).not.toContain('open');

    host.collapsible.set(false);
    host.tapToOpen.set(true);
    await settle();
    expect(chevron()).toBeNull();
    root.querySelector<HTMLElement>('.content')!.click();
    await settle();
    expect(section().classList).not.toContain('open');
  });

  it('takes its anchor as its id and opens when the fragment names it', async () => {
    const { fixture, root, fragments, settle, section, chevron } = setup('picks');
    await settle();
    const hostElement = root.querySelector('app-dropdown')!;
    expect(hostElement.hasAttribute('id')).toBe(false);
    expect(section().classList).not.toContain('open');

    fixture.componentInstance.anchor.set('picks');
    await settle();
    expect(hostElement.id).toBe('picks');
    expect(section().classList).toContain('open');

    chevron()!.click();
    await settle();
    expect(section().classList).not.toContain('open');
    fragments.next('rules');
    await settle();
    expect(section().classList).not.toContain('open');
    fragments.next('picks');
    await settle();
    expect(section().classList).toContain('open');
  });
});
