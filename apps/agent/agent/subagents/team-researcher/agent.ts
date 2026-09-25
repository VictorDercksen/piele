import { defineAgent } from 'eve';

/** Keep the model id in step with lib/models.ts. */
export default defineAgent({
  description:
    'Research one URC team before a fixture: injuries, selection news, coach comments, travel ' +
    "and rest notes, and the camp's mood, each with the source URL it came from.",
  model: 'deepseek/deepseek-v4-pro',
  defaultTools: false,
  limits: {
    maxInputTokensPerSession: 600_000,
    maxOutputTokensPerSession: 30_000,
    maxTokenCostUsdPerSession: 2,
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['team', 'items', 'mood'],
    properties: {
      team: { type: 'string' },
      items: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text', 'url', 'title'],
          properties: {
            kind: { type: 'string', enum: ['injury', 'selection', 'coach', 'travel', 'rest', 'other'] },
            text: { type: 'string', maxLength: 300 },
            url: { type: 'string' },
            title: { type: 'string', maxLength: 200 },
            publisher: { type: 'string', maxLength: 100 },
            publishedAt: { type: 'string' },
          },
        },
      },
      mood: {
        type: 'object',
        additionalProperties: false,
        required: ['score', 'note', 'urls'],
        properties: {
          score: { type: 'integer', minimum: -2, maximum: 2 },
          note: { type: 'string', maxLength: 300 },
          urls: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
});
