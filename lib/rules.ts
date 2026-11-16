import type { Keyword } from "./db";
import type { ThreadsPost } from "./threads";

const norm = (s: string) => s.toLowerCase().normalize("NFKD");

/** Filter aturan sederhana. Post yang gagal tetap disimpan (bisa dilihat di tab "Semua"). */
export function applyRules(k: Keyword, p: ThreadsPost): { pass: boolean; reason: string | null } {
  const text = norm(p.text ?? "");

  if (k.exclude_replies && p.is_reply) return { pass: false, reason: "Balasan (reply)" };
  if (text.trim().length < k.min_length) return { pass: false, reason: `Teks < ${k.min_length} karakter` };

  const banned = k.banned_words.find((w) => w && text.includes(norm(w)));
  if (banned) return { pass: false, reason: `Mengandung "${banned}"` };

  const missing = k.must_words.find((w) => w && !text.includes(norm(w)));
  if (missing) return { pass: false, reason: `Tidak ada "${missing}"` };

  return { pass: true, reason: null };
}
