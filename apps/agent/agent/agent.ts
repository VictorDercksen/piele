import { defineAgent } from 'eve';

/**
 * The preview writer. It reads fixture state from the Piele API, delegates team research
 * to the team-researcher subagent and stores a sourced preview. No web tools of its own.
 * Keep the model id in step with lib/models.ts.
 */
export default defineAgent({
  model: 'deepseek/deepseek-v4-pro',
  defaultTools: false,
  tool: false,
  limits: {
    maxInputTokensPerSession: 1_500_000,
    maxOutputTokensPerSession: 120_000,
    maxTokenCostUsdPerSession: 8,
    sessionTimeoutMs: 6 * 60 * 60 * 1_000,
  },
});
