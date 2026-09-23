import { ChangeDetectionStrategy, Component, input } from '@angular/core';
const PATHS: Record<string, string> = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  rounds: 'M5 5h14v16H5zM8 3v4m8-4v4M5 10h14M8 14h2m4 0h2m-8 3h2',
  standings: 'M4 21V11h5v10M9 21V4h6v17m0 0V8h5v13M2 21h20',
  duties: 'M9 5h11M9 12h11M9 19h11M3 5l1 1 2-3M3 12l1 1 2-3M3 19l1 1 2-3',
  decisions: 'M4 13h16v8H4zM8 13 5 7l9-4 3 6-9 4M9 17h6',
  more: 'M5 11h1v2H5zM11 11h1v2h-1zM17 11h1v2h-1z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  bell: 'M5 16V9a7 7 0 0 1 14 0v7l2 2H3zm5 5h4',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6zM8 12l3 3 5-6',
  book: 'M12 5C9 3 6 3 3 4v16c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zm0 0v16',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  check: 'M5 12l4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
};
@Component({
  selector: 'app-icon',
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="paths[name()] || paths[\'arrow\']" /></svg>',
  styles:
    ':host{display:inline-flex;width:20px;height:20px;flex-shrink:0}svg{width:100%;height:100%}',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input('arrow');
  readonly paths = PATHS;
}
