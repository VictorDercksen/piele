/** One numbered clause, such as 3.1. `text` may carry `**bold**` markers. */
export interface ConstitutionClause {
  readonly kind: 'clause';
  readonly number: string;
  readonly text: string;
}

export interface ConstitutionTerm {
  readonly name: string;
  readonly text: string;
}

export interface ConstitutionTerms {
  readonly kind: 'terms';
  readonly terms: readonly ConstitutionTerm[];
}

/** A titled callout, such as "The Champion's award". */
export interface ConstitutionPanel {
  readonly kind: 'panel';
  readonly title: string;
  readonly text: string;
}

export interface ConstitutionNote {
  readonly kind: 'note';
  readonly text: string;
}

export interface ConstitutionQuote {
  readonly kind: 'quote';
  readonly lines: readonly string[];
}

/** A titled sub-section of an article, such as 6.5 or A1. */
export interface ConstitutionSubsection {
  readonly kind: 'subsection';
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export interface ConstitutionParagraph {
  readonly kind: 'paragraph';
  readonly text: string;
}

/** A labelled line in the record of adoption. */
export interface ConstitutionRecord {
  readonly kind: 'record';
  readonly label: string;
  readonly text: string;
}

export interface ConstitutionTableRow {
  readonly trigger: string;
  readonly article: string;
  readonly action: string;
}

export interface ConstitutionTable {
  readonly kind: 'table';
  readonly headers: readonly string[];
  readonly rows: readonly ConstitutionTableRow[];
}

export type ConstitutionBlock =
  | ConstitutionClause
  | ConstitutionTerms
  | ConstitutionPanel
  | ConstitutionNote
  | ConstitutionQuote
  | ConstitutionSubsection
  | ConstitutionParagraph
  | ConstitutionRecord
  | ConstitutionTable;

export interface ConstitutionSection {
  /** Fragment id, such as `article-3` or `addendum-a`. */
  readonly id: string;
  /** "Article 3", "Addendum A"; absent for the record of adoption. */
  readonly label?: string;
  readonly title: string;
  readonly intro?: string;
  readonly blocks: readonly ConstitutionBlock[];
}

export interface ConstitutionHeader {
  readonly pool: string;
  readonly adopted: string;
  readonly amendment: string;
}
