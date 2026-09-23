import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Season-wide rules summary. Proposed rules are not enforceable until adopted. */
@Component({
  selector: 'app-constitution-page',
  templateUrl: './constitution.page.html',
  styleUrl: './constitution.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConstitutionPage {}
