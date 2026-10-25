// Cloudflare entry: API and /rolls/* through the handler, everything else
// from the built viewer (dist/, single-page fallback for /r/* and /lab/*).

import { handle, type Ctx, type Env } from './handler';

interface Assets { fetch(req: Request): Promise<Response> }

export default {
  async fetch(req: Request, env: Env & { ASSETS: Assets }, ctx: Ctx): Promise<Response> {
    return (await handle(req, env, ctx)) ?? env.ASSETS.fetch(req);
  },
};
