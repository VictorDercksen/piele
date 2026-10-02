import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONSTITUTION_SECTIONS } from './constitution.content';
import { ConstitutionPage } from './constitution.page';

describe('ConstitutionPage', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ConstitutionPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders every section heading in the document order', () => {
    const root = render();
    const headings = Array.from(root.querySelectorAll('h2')).map((h) => h.textContent ?? '');
    expect(headings.length).toBe(CONSTITUTION_SECTIONS.length);
    CONSTITUTION_SECTIONS.forEach((section, index) => {
      expect(headings[index]).toContain(section.title);
    });
    expect(CONSTITUTION_SECTIONS.map((s) => s.id)).toEqual([
      'article-1',
      'article-2',
      'article-3',
      'article-4',
      'article-5',
      'article-6',
      'addendum-a',
      'article-7',
      'article-8',
      'article-9',
      'adoption',
    ]);
  });

  it('links each section from the contents list', () => {
    const root = render();
    const links = root.querySelectorAll('.constitution-contents a');
    expect(links.length).toBe(CONSTITUTION_SECTIONS.length);
    expect(root.querySelector('.constitution-contents a[href$="#addendum-a"]')).not.toBeNull();
  });

  it('shows the adoption line, the Amendment 1 line and the record of adoption', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('Adopted by the league on 25 September 2026');
    expect(text).toContain('Amendment 1 of 1 October 2026: vote pending under Article 9.2');
    expect(text).toContain('Record of adoption');
    expect(text).toContain(
      'Amendment 1, 1 October 2026: Articles 3, 4, 5, 6.2, 6.6, 7, 8 and Addendum A aligned to The Pavilion app.',
    );
  });

  it('renders a bold span from a clause as emphasis, not as marker text', () => {
    const root = render();
    const strong = Array.from(root.querySelectorAll('.clause strong')).map((s) => s.textContent);
    expect(strong).toContain('a pick for each match before that match kicks off');
    expect(root.textContent).not.toContain('**');
  });

  it('adds no stray space around bold spans', () => {
    const text = render().textContent ?? '';
    expect(text).toContain('The pool is Piele URC 26/27, competing');
    expect(text).toContain('recorded in The Pavilion, the league');
    expect(text).toContain('Apply Addendum A, A1.');
  });

  it('renders the Addendum A table rows', () => {
    const rows = Array.from(render().querySelectorAll('.sanctions tbody tr'));
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual([
      'Missing or partial picks',
      'Weekly Wooden Spoon',
      'Video rejected on review',
      'Conduct finding',
    ]);
  });

  it('no longer shows the old summary page text', () => {
    const text = render().textContent ?? '';
    expect(text).not.toContain('NOT ADOPTED');
    expect(text).not.toContain('Voluntary');
  });
});
