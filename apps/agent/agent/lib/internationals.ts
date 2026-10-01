import { z } from 'zod';

/**
 * The test unions a player's international record may name. Keep this list in step with
 * `UNIONS` in apps/api/app/chat/glossary.py: the API refuses a research `internationals`
 * item whose `union` is not one of those keys. The researcher's output schema and
 * save_preview both use this one constant.
 */
export const UNIONS = [
  'South Africa',
  'New Zealand',
  'Australia',
  'Argentina',
  'France',
  'Italy',
  'Ireland',
  'Wales',
  'Scotland',
  'England',
  'Georgia',
  'Fiji',
  'Samoa',
  'Tonga',
  'Japan',
  'United States',
  'Canada',
  'Uruguay',
  'Portugal',
  'Spain',
  'Romania',
  'Namibia',
  'Chile',
  'Germany',
  'Netherlands',
  'Hong Kong China',
  'Zimbabwe',
  'Kenya',
] as const;

/** At most this many internationals per side, as the API accepts. */
export const MAX_INTERNATIONALS = 30;

/** The date format of `capsAsOf` and `lastTestOn`. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The `internationals` property of the team-researcher's output schema. */
export const INTERNATIONALS_OUTPUT_SCHEMA = {
  type: 'array',
  maxItems: MAX_INTERNATIONALS,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'union', 'url', 'title'],
    properties: {
      name: { type: 'string', maxLength: 100 },
      union: { type: 'string', enum: [...UNIONS] },
      caps: { type: 'integer', minimum: 1, maximum: 250 },
      capsAsOf: { type: 'string', description: 'YYYY-MM-DD, the date the caps figure was current' },
      lastTestOn: { type: 'string', description: 'YYYY-MM-DD, the date of the latest Test' },
      url: { type: 'string' },
      title: { type: 'string', maxLength: 200 },
      publisher: { type: 'string', maxLength: 100 },
    },
  },
} as const;

/** A real calendar date in YYYY-MM-DD form, as the API's date check accepts. */
function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Control characters other than a line break, which the API refuses in text. */
const CONTROL = /[\x00-\x09\x0b-\x1f\x7f]/;

function text(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !CONTROL.test(value));
}

function webUrl(value: string): boolean {
  if (value.length > 2000 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== '';
  } catch {
    return false;
  }
}

const international = z.object({
  name: text(100),
  union: z.enum(UNIONS),
  caps: z.number().int().min(1).max(250).optional(),
  capsAsOf: z.string().refine(isDate).optional(),
  lastTestOn: z.string().refine(isDate).optional(),
  url: z.string().refine(webUrl),
  title: text(200),
  publisher: text(100).optional(),
});

export type International = z.infer<typeof international>;

/**
 * The research `internationals` list as save_preview passes it on. Valid items go through
 * unchanged; an item the API would refuse (an unknown union, caps out of range, an impossible date, a
 * blank title) is dropped
 * rather than costing the whole preview, and the list is cut to the API's limit.
 */
export const internationals = z
  .array(z.unknown())
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = international.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }).slice(0, MAX_INTERNATIONALS),
  )
  .optional();

/** The record the API's fixture state holds for a selected player. */
export interface KnownInternational {
  readonly name: string;
  readonly union: string;
  readonly caps: number | null;
  readonly capsAsOf: string | null;
  readonly lastTestOn: string | null;
  readonly checkedAt: string;
  readonly origin: 'researcher' | 'operator';
}

/** The same normalisation as the API's `player_key`: accents stripped, lower case, one space. */
export function playerKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
