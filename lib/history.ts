// Ține evidența activităților deja folosite, ca AI-ul să nu le repete.
// Foloseste Upstash Redis daca e configurat (persistent, recomandat - se
// adauga gratuit din Vercel Marketplace -> Storage -> Redis).
// Daca nu e configurat, foloseste memorie in RAM (se reseteaza la fiecare
// redeploy / cold start) - suficient pentru testare locala.

let memoryFallback: string[] = [];

function getRedisEnv() {
  // Vercel poate seta oricare din aceste perechi, in functie de integrare
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function getRedis() {
  const env = getRedisEnv();
  if (!env) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url: env.url, token: env.token });
}

const HISTORY_KEY = "idei_folosite";
const MAX_HISTORY = 300; // limitam ca sa nu creasca prompt-ul la infinit

export async function getUsedIdeas(): Promise<string[]> {
  const redis = await getRedis();
  if (!redis) return memoryFallback;
  const list = (await redis.get<string[]>(HISTORY_KEY)) || [];
  return list;
}

export async function saveUsedIdeas(newIdeas: string[]): Promise<void> {
  const redis = await getRedis();
  const current = await getUsedIdeas();
  const merged = Array.from(new Set([...current, ...newIdeas])).slice(-MAX_HISTORY);

  if (!redis) {
    memoryFallback = merged;
    return;
  }
  await redis.set(HISTORY_KEY, merged);
}
