import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { isAllowedUrl } from '../lib/allowlist';
import { fixtureInputs } from '../lib/fixture-inputs';
import { RESEARCHER_MODEL, WRITER_MODEL } from '../lib/models';
import { pieleApi } from '../lib/piele-api';

// Mirrors the API's limits in apps/api/app/agent/models.py; the API validates again.
const sourceRefs = z.array(z.number().int().min(0)).min(1).max(5);
const line = z.string().trim().min(1).max(300);
const factors = z.array(z.object({ text: line, sources: sourceRefs })).max(6);
const mood = z.object({ score: z.number().int().min(-2).max(2), note: line, sources: sourceRefs });

const input = z.object({
  fixtureId: z.string().regex(/^\d{1,12}$/),
  summary: z.string().trim().min(1).max(1500),
  keyFactors: z.object({ home: factors, away: factors }),
  sentiment: z.object({ home: mood, away: mood }),
  sources: z
    .array(
      z.object({
        url: z.string().max(2000),
        title: z.string().trim().min(1).max(200),
        publisher: z.string().trim().min(1).max(100).optional(),
        publishedAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export default defineTool({
  description:
    'Store the finished preview for a fixture. Call get_fixture_state for the fixture first in ' +
    'this session. Every key factor and mood cites sources by their zero-based index in sources.',
  inputSchema: input,
  label: { start: ({ fixtureId }) => `Save the preview for fixture ${fixtureId}` },
  async execute(preview, ctx) {
    const inputs = fixtureInputs.get()[preview.fixtureId];
    if (!inputs) {
      throw new Error(`Call get_fixture_state for fixture ${preview.fixtureId} before saving its preview.`);
    }
    const outside = preview.sources.filter((source) => !isAllowedUrl(source.url));
    if (outside.length) {
      throw new Error(
        `These sources are not on the allowed list; remove them and their citations: ${outside
          .map((source) => source.url)
          .join(', ')}`,
      );
    }
    return pieleApi<{ id: string; revision: number }>('/previews', {
      method: 'POST',
      signal: ctx.abortSignal,
      body: {
        ...preview,
        ...inputs,
        models: { writer: WRITER_MODEL, researcher: RESEARCHER_MODEL },
        // One stored preview per fixture and session, so a retried save is harmless.
        runId: ctx.session.id.replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 200),
      },
    });
  },
});
