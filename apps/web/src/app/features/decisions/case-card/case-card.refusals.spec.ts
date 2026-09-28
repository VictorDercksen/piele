import { ApiError } from '../../../core/api/api-error';
import { caseRefusal } from './case-card.refusals';

describe('caseRefusal', () => {
  it('turns a case that moved on into a warning and leaves failures alone', () => {
    expect(caseRefusal(new ApiError(409, 'stale_case', 'x'))).toContain('changed');
    expect(caseRefusal(new ApiError(409, 'voting_closed', 'x'))).toContain('closed');
    expect(caseRefusal(new ApiError(409, 'not_in_review', 'x'))).toContain('already ruled');
    expect(caseRefusal(new ApiError(0, 'offline', 'x'))).toBeNull();
    expect(caseRefusal(new Error('x'))).toBeNull();
  });
});
