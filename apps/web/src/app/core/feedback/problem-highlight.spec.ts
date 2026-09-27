import { PROBLEM_FLAG_MS, highlightProblem, problemTarget } from './problem-highlight';

describe('highlightProblem', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  function textInput(): HTMLInputElement {
    const input = document.createElement('input');
    host.append(input);
    return input;
  }

  it('flags the control without focusing it and scrolls it into view', () => {
    const input = textInput();
    const scroll = vi.fn();
    input.scrollIntoView = scroll;
    const focus = vi.spyOn(input, 'focus');
    highlightProblem(input);
    expect(input.classList).toContain('problem-flag');
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: expect.any(String) });
  });

  it('works where the browser has no scrollIntoView and ignores a missing control', () => {
    const input = textInput();
    Object.defineProperty(input, 'scrollIntoView', { value: undefined });
    expect(() => highlightProblem(input)).not.toThrow();
    expect(input.classList).toContain('problem-flag');
    expect(() => highlightProblem(null)).not.toThrow();
    expect(() => highlightProblem(undefined)).not.toThrow();
  });

  it('drops the flag when its animation ends', () => {
    vi.useFakeTimers();
    const input = textInput();
    highlightProblem(input);
    input.dispatchEvent(new Event('animationend'));
    expect(input.classList).not.toContain('problem-flag');
  });

  it('drops the flag after its time when no animation runs', () => {
    vi.useFakeTimers();
    const input = textInput();
    highlightProblem(input);
    vi.advanceTimersByTime(PROBLEM_FLAG_MS - 1);
    expect(input.classList).toContain('problem-flag');
    vi.advanceTimersByTime(1);
    expect(input.classList).not.toContain('problem-flag');
  });

  it('restarts the flash when the same control is flagged again', () => {
    vi.useFakeTimers();
    const input = textInput();
    highlightProblem(input);
    vi.advanceTimersByTime(PROBLEM_FLAG_MS - 100);
    highlightProblem(input);
    vi.advanceTimersByTime(200);
    // The first timer was cancelled: the second flag keeps its full time.
    expect(input.classList).toContain('problem-flag');
    vi.advanceTimersByTime(PROBLEM_FLAG_MS);
    expect(input.classList).not.toContain('problem-flag');
  });

  it('flags the visible wrapper of a zero-size radio or file input', () => {
    const label = document.createElement('label');
    const file = document.createElement('input');
    file.type = 'file';
    label.append(file);
    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    const radio = document.createElement('input');
    radio.type = 'radio';
    group.append(radio);
    host.append(label, group);

    highlightProblem(file);
    highlightProblem(radio);
    expect(problemTarget(file)).toBe(label);
    expect(label.classList).toContain('problem-flag');
    expect(file.classList).not.toContain('problem-flag');
    expect(group.classList).toContain('problem-flag');
    expect(radio.classList).not.toContain('problem-flag');
  });

  it('flags a text input itself, even inside a wrapper', () => {
    const field = document.createElement('div');
    field.className = 'field';
    const input = document.createElement('input');
    field.append(input);
    host.append(field);
    highlightProblem(input);
    expect(input.classList).toContain('problem-flag');
    expect(field.classList).not.toContain('problem-flag');
  });
});
