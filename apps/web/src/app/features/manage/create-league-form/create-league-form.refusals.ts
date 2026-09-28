import { ApiField } from './create-league-form.models';

/** API refusals that concern one field (a warning that highlights it); any other code is an error. */
export const FIELD_OF_CODE: Readonly<Partial<Record<string, ApiField>>> = {
  slug_taken: 'slug',
  invalid_slug: 'slug',
  duplicate_member: 'members',
  unknown_captain: 'captain',
};
