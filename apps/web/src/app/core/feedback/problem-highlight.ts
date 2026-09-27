/** The class `src/styles/ui.scss` draws as a yellow outline with a fading halo. */
export const PROBLEM_FLAG_CLASS = 'problem-flag';

/** How long the flag stays when no `animationend` arrives (reduced motion, no CSS). */
export const PROBLEM_FLAG_MS = 1600;

/** The wrapper a zero-size control (a radio, a file input behind a label) is flagged through. */
const WRAPPER_SELECTOR = '[role="radiogroup"], .rule-field, .field, label, fieldset';

const pending = new WeakMap<HTMLElement, () => void>();

/**
 * Points a validation problem out without moving focus: scrolls the control into view and
 * flashes a yellow outline on it (or on its visible wrapper when the control has no size).
 * Focusing a text box would zoom the page on phones, so a warning never does.
 */
export function highlightProblem(element: HTMLElement | null | undefined): void {
  if (!element) return;
  const target = problemTarget(element);
  const view = target.ownerDocument.defaultView;
  const reduced =
    typeof view?.matchMedia === 'function' &&
    view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof target.scrollIntoView === 'function')
    target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  flag(target);
}

/**
 * Where the flag lands: a radio or file input drawn through its label (zero size, or laid
 * over the label transparent) flags its closest visible wrapper; anything else flags itself.
 */
export function problemTarget(element: HTMLElement): HTMLElement {
  const drawnElsewhere =
    element instanceof HTMLInputElement && (element.type === 'radio' || element.type === 'file');
  if (!drawnElsewhere || isVisible(element)) return element;
  return element.closest<HTMLElement>(WRAPPER_SELECTOR) ?? element;
}

function isVisible(element: HTMLElement): boolean {
  if (element.offsetWidth === 0 || element.offsetHeight === 0) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !style || (style.opacity !== '0' && style.visibility !== 'hidden');
}

function flag(target: HTMLElement): void {
  pending.get(target)?.();
  target.classList.remove(PROBLEM_FLAG_CLASS);
  // Reading the width forces a reflow, so the animation restarts when the class returns.
  void target.offsetWidth;
  target.classList.add(PROBLEM_FLAG_CLASS);

  const clear = (): void => {
    target.classList.remove(PROBLEM_FLAG_CLASS);
    finish();
  };
  const onEnd = (event: AnimationEvent): void => {
    if (event.target === target) clear();
  };
  const timer = setTimeout(clear, PROBLEM_FLAG_MS);
  const finish = (): void => {
    clearTimeout(timer);
    target.removeEventListener('animationend', onEnd);
    if (pending.get(target) === finish) pending.delete(target);
  };
  target.addEventListener('animationend', onEnd);
  pending.set(target, finish);
}
