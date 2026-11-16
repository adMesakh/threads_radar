import Link from "next/link";
import { db, ensureSchema, type Keyword, type Post } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { aiEnabled } from "@/lib/curate";
import { refreshNow, setStatus } from "./actions";
import { SubmitButton } from "./components";
import type { RunSummary } from "@/lib/pipeline";
import { checkSetup } from "@/lib/setup";
import { SetupScreen } from "./setup-screen";

export const maxDuration = 300;

type View = "curated" | "all" | "saved" | "hidden";
const VIEWS: { id: View; label: string }[] = [
  { id: "curated", label: "Terkurasi" },
  { id: "all", label: "Semua" },
  { id: "saved", label: "Disimpan" },
  { id: "hidden", label: "Dibuang" },
];

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function Feed({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const problems = await checkSetup();
  if (problems.length) return <SetupScreen problems={problems} />;
  await requireAuth();
  await ensureSchema();
  const sp = await searchParams;
  const sql = db();

  const keywords = (await sql`select * from keywords order by active desc, id`) as unknown as Keyword[];
  if (keywords.length === 0) {
    return (
      <div className="empty">
        <h1>Belum ada keyword</h1>
        <p className="muted">Tambahkan keyword dan kriteria kurasinya dulu. Post akan langsung ditarik setelah disimpan.</p>
        <Link href="/keywords" className="btn primary">Tambah keyword</Link>
      </div>
    );
  }

  const kId = sp.k && sp.k !== "all" ? Number(sp.k) : null;
  const view = (VIEWS.find((v) => v.id === sp.view)?.id ?? "curated") as View;
  const sort = sp.sort === "new" ? "new" : "score";

  const kwFilter = kId ? sql`and p.keyword_id = ${kId}` : sql``;
  const viewFilter = {
    curated: sql`and p.rule_pass and p.status <> 'hidden' and (p.ai_score is null or p.ai_score >= k.min_score)`,
    all: sql`and p.status <> 'hidden'`,
    saved: sql`and p.status = 'saved'`,
    hidden: sql`and p.status = 'hidden'`,
  }[view];
  const order = sort === "new" ? sql`p.posted_at desc nulls last` : sql`p.ai_score desc nulls last, p.posted_at desc nulls last`;

  const posts = (await sql`
    select p.*, k.query as keyword_query, k.min_score
    from posts p join keywords k on k.id = p.keyword_id
    where true ${kwFilter} ${viewFilter}
    order by ${order}
    limit 200`) as unknown as (Post & { keyword_query: string; min_score: number })[];

  const [counts] = await sql`
    select
      count(*) filter (where p.rule_pass and p.status <> 'hidden' and (p.ai_score is null or p.ai_score >= k.min_score))::int as curated,
      count(*) filter (where p.status <> 'hidden')::int as all,
      count(*) filter (where p.status = 'saved')::int as saved,
      count(*) filter (where p.status = 'hidden')::int as hidden
    from posts p join keywords k on k.id = p.keyword_id
    where true ${kwFilter}`;

  const [lastRun] = await sql`select finished_at, trigger, summary from fetch_runs where finished_at is not null order by id desc limit 1`;
  const summary = lastRun?.summary as RunSummary | undefined;
  const errors = summary?.results.filter((r) => r.error) ?? [];

  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ k: kId ? String(kId) : "all", view, sort, ...patch });
    return `/?${q}`;
  };

  return (
    <div className="feed">
      <section className="toolbar">
        <div className="chips" role="tablist" aria-label="Keyword">
          <Link href={href({ k: "all" })} className={`chip ${!kId ? "on" : ""}`}>Semua keyword</Link>
          {keywords.map((k) => (
            <Link key={k.id} href={href({ k: String(k.id) })} className={`chip ${kId === k.id ? "on" : ""} ${k.active ? "" : "off"}`}>
              {k.query}
            </Link>
          ))}
        </div>
        <form action={refreshNow}>
          {kId && <input type="hidden" name="keyword_id" value={kId} />}
          <SubmitButton className="btn primary" pendingText="Menarik post…">↻ Tarik post baru</SubmitButton>
        </form>
      </section>

      <section className="meta">
        <span>
          Terakhir diperbarui: {lastRun ? `${fmt.format(lastRun.finished_at)} (${lastRun.trigger === "cron" ? "otomatis" : "manual"})` : "belum pernah"}
        </span>
        <span className={`pill ${aiEnabled() ? "ok" : "warn"}`}>{aiEnabled() ? "Kurasi AI aktif" : "AI nonaktif — hanya aturan"}</span>
        {process.env.THREADS_MOCK === "1" && <span className="pill warn">Mode data contoh</span>}
      </section>
      {(errors.length > 0 || summary?.token?.startsWith("Gagal")) && (
        <div className="alert">
          {summary?.token?.startsWith("Gagal") && <div>{summary.token}</div>}
          {errors.map((e) => (
            <div key={e.keyword}>
              <b>{e.keyword}:</b> {e.error}
            </div>
          ))}
        </div>
      )}

      <section className="tabs-row">
        <div className="tabs">
          {VIEWS.map((v) => (
            <Link key={v.id} href={href({ view: v.id })} className={`tab ${view === v.id ? "on" : ""}`}>
              {v.label} <span className="count">{counts[v.id]}</span>
            </Link>
          ))}
        </div>
        <div className="sort">
          Urutkan:
          <Link href={href({ sort: "score" })} className={sort === "score" ? "on" : ""}>Skor</Link>
          <Link href={href({ sort: "new" })} className={sort === "new" ? "on" : ""}>Terbaru</Link>
        </div>
      </section>

      {posts.length === 0 ? (
        <p className="muted center">Belum ada post di tampilan ini.</p>
      ) : (
        <ul className="cards">
          {posts.map((p) => (
            <li key={`${p.keyword_id}-${p.id}`} className={`card ${p.status}`}>
              <div className="card-head">
                <span className="author">@{p.username ?? "?"}</span>
                <span className="muted small">{p.posted_at ? fmt.format(p.posted_at) : ""}</span>
                {!kId && <span className="kw">{p.keyword_query}</span>}
                <Score value={p.ai_score} min={p.min_score} />
              </div>
              <p className="text">{p.text || <i className="muted">(tanpa teks — {p.media_type})</i>}</p>
              {(p.ai_reason || p.ai_tags.length > 0 || !p.rule_pass) && (
                <div className="why">
                  {!p.rule_pass && <span className="tag bad">✕ {p.rule_reason}</span>}
                  {p.ai_tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                  {p.ai_reason && <span className="reason">{p.ai_reason}</span>}
                </div>
              )}
              <div className="actions">
                {p.permalink && (
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="btn ghost">Buka di Threads ↗</a>
                )}
                <StatusButton p={p} status={p.status === "saved" ? "new" : "saved"} label={p.status === "saved" ? "★ Disimpan" : "☆ Simpan"} />
                <StatusButton p={p} status={p.status === "hidden" ? "new" : "hidden"} label={p.status === "hidden" ? "Kembalikan" : "Buang"} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Score({ value, min }: { value: number | null; min: number }) {
  if (value == null) return <span className="score none" title="Belum dinilai AI">–</span>;
  const cls = value >= Math.max(min, 75) ? "hi" : value >= min ? "mid" : "lo";
  return <span className={`score ${cls}`} title={`Skor AI (minimum ${min})`}>{value}</span>;
}

function StatusButton({ p, status, label }: { p: Post; status: string; label: string }) {
  return (
    <form action={setStatus}>
      <input type="hidden" name="keyword_id" value={p.keyword_id} />
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton className="btn ghost">{label}</SubmitButton>
    </form>
  );
}
