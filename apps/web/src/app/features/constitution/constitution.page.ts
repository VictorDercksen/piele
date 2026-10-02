import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONSTITUTION_HEADER, CONSTITUTION_SECTIONS } from './constitution.content';
import { EmphasisText } from './emphasis-text';

/** The adopted season constitution, read from the typed catalogue. It has no state. */
@Component({
  selector: 'app-constitution-page',
  templateUrl: './constitution.page.html',
  styleUrl: './constitution.page.scss',
  // prettier-ignore
  imports: [
    RouterLink,
    EmphasisText,
  ],
})
export class ConstitutionPage {
  private readonly document = inject(DOCUMENT);
  protected readonly header = CONSTITUTION_HEADER;
  protected readonly sections = CONSTITUTION_SECTIONS;

  /** The router records the fragment; this scrolls to it, since the app has no anchor scrolling. */
  protected jump(id: string): void {
    this.document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }
}
