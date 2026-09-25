import { defineTool } from 'eve/tools';
import { webFetch } from 'eve/tools/web_fetch';
import { isAllowedUrl } from '../../../lib/allowlist';

export default defineTool({
  ...webFetch,
  description: 'Fetch a page from the URC, a club site or an allowed rugby news outlet.',
  execute(input, ctx) {
    if (!isAllowedUrl(input.url)) {
      throw new Error(`${new URL(input.url).hostname} is not on the allowed list of sites.`);
    }
    return webFetch.execute(input, ctx);
  },
});
