import { handleDiagnose, type Env } from "./handlers/diagnose";

export default {
  async fetch(req: Request, env: Env & { ASSETS: Fetcher }): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/diagnose" && req.method === "POST") {
      return handleDiagnose(req, env);
    }
    // それ以外は静的アセット(public/)
    return env.ASSETS.fetch(req);
  },
};
