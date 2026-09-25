import { localDev, vercelOidc } from 'eve/channels/auth';
import { eveChannel } from 'eve/channels/eve';

/**
 * Only this Vercel project (its schedules and subagent calls) and a local `eve dev`
 * server may start sessions. Every other caller is rejected.
 */
export default eveChannel({
  auth: [vercelOidc(), localDev()],
});
