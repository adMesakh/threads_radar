import { getSetting, setSetting, type Keyword } from "./db";

const API = "https://graph.threads.net";
const FIELDS = "id,text,media_type,permalink,timestamp,username,is_reply,is_quote_post";

export type ThreadsPost = {
  id: string;
  text?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
  username?: string;
  is_reply?: boolean;
  is_quote_post?: boolean;
};

/** Token disimpan di DB setelah di-refresh; awalnya diambil dari env. */
async function getToken(): Promise<string> {
  const stored = await getSetting("threads_token");
  const token = stored?.value || process.env.THREADS_ACCESS_TOKEN;
  if (!token) throw new Error("THREADS_ACCESS_TOKEN belum diisi");
  return token;
}

/**
 * Long-lived token Threads berlaku 60 hari. Kita refresh kalau sudah >7 hari
 * sejak refresh terakhir, jadi selama cron jalan token tidak pernah kedaluwarsa.
 */
export async function maybeRefreshToken(): Promise<string | null> {
  if (process.env.THREADS_MOCK === "1") return null;
  const last = await getSetting("threads_token_refreshed_at");
  const lastAt = last ? new Date(last.value).getTime() : 0;
  if (Date.now() - lastAt < 7 * 24 * 3600 * 1000) return null;

  const token = await getToken();
  const url = new URL("/refresh_access_token", API);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !body.access_token) {
    return `Gagal refresh token: ${body.error?.message ?? res.status}`;
  }
  await setSetting("threads_token", body.access_token);
  await setSetting("threads_token_refreshed_at", new Date().toISOString());
  if (body.expires_in) {
    await setSetting("threads_token_expires_at", new Date(Date.now() + body.expires_in * 1000).toISOString());
  }
  return "Token di-refresh";
}

export async function searchThreads(k: Keyword, limit = 50): Promise<ThreadsPost[]> {
  if (process.env.THREADS_MOCK === "1") return mockPosts(k);

  const token = await getToken();
  const url = new URL("/v1.0/keyword_search", API);
  url.searchParams.set("q", k.query);
  url.searchParams.set("search_type", k.search_type);
  if (k.media_type) url.searchParams.set("media_type", k.media_type);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  url.searchParams.set("fields", FIELDS);
  // Ambil dari sedikit sebelum fetch terakhir (atau 7 hari ke belakang untuk keyword baru)
  const sinceMs = k.last_fetched_at ? k.last_fetched_at.getTime() - 3600_000 : Date.now() - 7 * 24 * 3600_000;
  url.searchParams.set("since", String(Math.floor(sinceMs / 1000)));
  url.searchParams.set("access_token", token);

  // Endpoint ini kadang balas 5xx; coba ulang sekali.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { data?: ThreadsPost[] };
      return body.data ?? [];
    }
    if (res.status < 500 || attempt === 1) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Threads API ${res.status}: ${body.error?.message ?? "error"}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
}

/** Data palsu untuk mencoba website tanpa akses API (THREADS_MOCK=1). */
function mockPosts(k: Keyword): ThreadsPost[] {
  const samples = [
    `Akhirnya nemu ${k.query} yang harganya masuk akal, kondisi mulus, cuma 6 bulan pakai. DM aja kalau minat.`,
    `Ada yang punya pengalaman pakai ${k.query}? Lagi bandingin sama merek lain, butuh review jujur.`,
    `${k.query} promo gila hari ini!!! klik link di bio 🔥🔥🔥`,
    `Review ${k.query} setelah 1 tahun: baterai masih awet, tapi software update agak lambat. Overall worth it.`,
    `Jual cepat ${k.query}, nego tipis, COD Jakarta Selatan.`,
    `Bukan soal ${k.query} sih, tapi siapa yang nonton bola semalam?`,
  ];
  const now = Date.now();
  return samples.map((text, i) => ({
    id: `mock-${k.id}-${Math.floor(now / 3600_000)}-${i}`,
    text,
    media_type: "TEXT_POST",
    permalink: undefined, // data contoh tidak punya post asli
    timestamp: new Date(now - i * 2 * 3600_000).toISOString(),
    username: ["rina.dev", "budi_s", "promo.official", "techreview.id", "jualan.jaksel", "andi99"][i],
    is_reply: i === 5,
    is_quote_post: false,
  }));
}
