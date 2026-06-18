/** 診断結果JSONをplace_id+競合フラグでキャッシュ。 */
export async function getCached<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key);
  return v ? (JSON.parse(v) as T) : null;
}

export async function setCached(kv: KVNamespace, key: string, value: unknown, ttlSeconds = 14 * 86400): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}
