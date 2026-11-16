import { db, ensureSchema, type Keyword } from "./db";
import { searchThreads, maybeRefreshToken } from "./threads";
import { applyRules } from "./rules";
import { scorePosts, aiEnabled } from "./curate";

export type KeywordResult = { keyword: string; fetched: number; new: number; passed: number; scored: number; error?: string };
export type RunSummary = { token?: string | null; results: KeywordResult[]; ms: number };

/** Ambil post baru → filter aturan → skor AI. Dipanggil oleh cron dan tombol "Refresh". */
export async function runFetch(trigger: "cron" | "manual", onlyKeywordId?: number): Promise<RunSummary> {
  await ensureSchema();
  const sql = db();
  const t0 = Date.now();
  const [run] = await sql`insert into fetch_runs (trigger) values (${trigger}) returning id`;

  const summary: RunSummary = { results: [], ms: 0 };
  try {
    summary.token = await maybeRefreshToken();
  } catch (e) {
    summary.token = `Gagal refresh token: ${(e as Error).message}`;
  }

  const keywords = (onlyKeywordId
    ? await sql`select * from keywords where id = ${onlyKeywordId}`
    : await sql`select * from keywords where active order by id`) as unknown as Keyword[];

  for (const k of keywords) {
    const r: KeywordResult = { keyword: k.query, fetched: 0, new: 0, passed: 0, scored: 0 };
    try {
      const posts = await searchThreads(k);
      r.fetched = posts.length;
      for (const p of posts) {
        const rule = applyRules(k, p);
        const inserted = await sql`
          insert into posts (keyword_id, id, text, media_type, permalink, username, posted_at, is_reply, is_quote_post, rule_pass, rule_reason)
          values (${k.id}, ${p.id}, ${p.text ?? null}, ${p.media_type ?? null}, ${p.permalink ?? null}, ${p.username ?? null},
                  ${p.timestamp ? new Date(p.timestamp) : null}, ${!!p.is_reply}, ${!!p.is_quote_post}, ${rule.pass}, ${rule.reason})
          on conflict (keyword_id, id) do nothing
          returning id`;
        if (inserted.length) {
          r.new++;
          if (rule.pass) r.passed++;
        }
      }
      await sql`update keywords set last_fetched_at = now() where id = ${k.id}`;
      r.scored = await scorePending(k);
    } catch (e) {
      r.error = (e as Error).message;
    }
    summary.results.push(r);
  }

  summary.ms = Date.now() - t0;
  await sql`update fetch_runs set finished_at = now(), summary = ${sql.json(summary)} where id = ${run.id}`;
  return summary;
}

/** Skor post yang lolos aturan tapi belum dinilai AI (maks 60 per keyword per run). */
export async function scorePending(k: Keyword): Promise<number> {
  if (!aiEnabled()) return 0;
  const sql = db();
  const pending = (await sql`
    select id, text, username from posts
    where keyword_id = ${k.id} and rule_pass and ai_score is null and status <> 'hidden'
    order by posted_at desc nulls last limit 60`) as unknown as { id: string; text: string | null; username: string | null }[];

  let n = 0;
  for (let i = 0; i < pending.length; i += 20) {
    const scores = await scorePosts(k, pending.slice(i, i + 20));
    for (const s of scores) {
      await sql`
        update posts set ai_score = ${s.score}, ai_reason = ${s.reason}, ai_tags = ${s.tags}, ai_scored_at = now()
        where keyword_id = ${k.id} and id = ${s.id}`;
      n++;
    }
  }
  return n;
}

/** Hitung ulang aturan & reset skor AI setelah keyword diedit. */
export async function reapplyRules(k: Keyword) {
  const sql = db();
  const rows = (await sql`select id, text, is_reply from posts where keyword_id = ${k.id}`) as unknown as { id: string; text: string | null; is_reply: boolean }[];
  for (const p of rows) {
    const rule = applyRules(k, { id: p.id, text: p.text ?? undefined, is_reply: p.is_reply });
    await sql`update posts set rule_pass = ${rule.pass}, rule_reason = ${rule.reason} where keyword_id = ${k.id} and id = ${p.id}`;
  }
}
