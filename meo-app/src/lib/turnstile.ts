/** Cloudflare Turnstile トークンを検証。 */
export async function verifyTurnstile(token: string, secret: string, ip?: string, fetchFn = fetch): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const resp = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!resp.ok) return false;
  const data: any = await resp.json();
  return data.success === true;
}
