import { defineChannel, POST } from 'eve/channels';
import { chatTurn } from '../lib/chat/turn';
import { MAX_BODY_BYTES, parseChatRequest } from '../lib/chat/request';
import { WRITER_MODEL } from '../lib/models';
import { hasAgentToken } from '../lib/run-request';

/**
 * POST /chat/turn: one match chat answer for The Pavilion API, streamed as an AI SDK UI
 * message stream. Stateless and tool-free: the model sees only the context and messages the
 * API sends, and no eve session is started, so the channel has no `receive`. The string model
 * id resolves through AI Gateway, the AI SDK's default provider, like the agents' models.
 */
export default defineChannel({
  routes: [
    POST('/chat/turn', async (request) => {
      if (!hasAgentToken(request.headers.get('authorization'), process.env.PIELE_AGENT_TOKEN)) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
        return Response.json({ error: 'Body is larger than 64 KiB.' }, { status: 413 });
      }
      const text = await request.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
        return Response.json({ error: 'Body is larger than 64 KiB.' }, { status: 413 });
      }
      const parsed = parseChatRequest(text);
      if ('error' in parsed) return Response.json(parsed, { status: 422 });
      return chatTurn(parsed, { model: WRITER_MODEL, signal: AbortSignal.timeout(45_000) });
    }),
  ],
});
