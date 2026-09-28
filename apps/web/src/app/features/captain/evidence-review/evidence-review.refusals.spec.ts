import { ApiError } from '../../../core/api/api-error';
import { overrideRefusal } from './evidence-review.refusals';

describe('overrideRefusal', () => {
  it('explains evidence decided first, and leaves other failures alone', () => {
    expect(overrideRefusal(new ApiError(409, 'already_decided', 'x'))).toContain('already decided');
    expect(overrideRefusal(new ApiError(403, 'self_review', 'x'))).toBeNull();
    expect(overrideRefusal(new Error('x'))).toBeNull();
  });
});
