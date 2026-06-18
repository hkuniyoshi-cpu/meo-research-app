export interface RateResult { allowed: boolean; count: number; }

/** IP×日付で診断回数を制限。KVキーは `rl:<date>:<ip>`、TTL 2日。 */
export async function checkRateLimit(
  kv: KVNamespace, ip: string, date: string, limit: number
): Promise<RateResult> {
  const key = `rl:${date}:${ip}`;
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  const count = current + 1;
  await kv.put(key, String(count), { expirationTtl: 2 * 86400 });
  return { allowed: count <= limit, count };
}
