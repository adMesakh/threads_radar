import Link from "next/link";
import { db, ensureSchema, type Keyword } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { aiEnabled } from "@/lib/curate";
import { saveKeyword, toggleKeyword, deleteKeyword } from "../actions";
import { SubmitButton, ConfirmButton } from "../components";

export const maxDuration = 300;

export default async function KeywordsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAuth();
  await ensureSchema();
  const sql = db();
  const { edit } = await searchParams;

  const keywords = (await sql`
    select k.*, (select count(*)::int from posts p where p.keyword_id = k.id) as total
    from keywords k order by k.id`) as unknown as (Keyword & { total: number })[];
  const editing = edit ? keywords.find((k) => k.id === Number(edit)) : undefined;

  return (
    <div className="kw-page">
      <section>
        <h1>Keyword</h1>
        {keywords.length === 0 && <p className="muted">Belum ada keyword.</p>}
        <ul className="kw-list">
          {keywords.map((k) => (
            <li key={k.id} className={k.active ? "" : "inactive"}>
              <div>
                <b>{k.query}</b>
                <div className="muted small">
                  {k.search_type === "TOP" ? "Populer" : "Terbaru"}
                  {k.media_type ? ` · ${k.media_type}` : ""} · {k.total} post · min skor {k.min_score}
                  {!k.active && " · nonaktif"}
                </div>
              </div>
              <div className="row">
                <Link href={`/keywords?edit=${k.id}`} className="btn ghost">Edit</Link>
                <form action={toggleKeyword}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="btn ghost">{k.active ? "Jeda" : "Aktifkan"}</button>
                </form>
                <form action={deleteKeyword}>
                  <input type="hidden" name="id" value={k.id} />
                  <ConfirmButton className="btn ghost danger" message={`Hapus "${k.query}" beserta semua post-nya?`}>Hapus</ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>{editing ? `Edit "${editing.query}"` : "Tambah keyword"}</h2>
        <form action={saveKeyword} className="stack" key={editing?.id ?? "new"}>
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <label>
            Keyword
            <input name="query" required defaultValue={editing?.query} placeholder="mis. iphone 15 bekas" />
          </label>

          <div className="grid2">
            <label>
              Urutan hasil
              <select name="search_type" defaultValue={editing?.search_type ?? "RECENT"}>
                <option value="RECENT">Terbaru</option>
                <option value="TOP">Populer</option>
              </select>
            </label>
            <label>
              Jenis post
              <select name="media_type" defaultValue={editing?.media_type ?? ""}>
                <option value="">Semua</option>
                <option value="TEXT">Teks</option>
                <option value="IMAGE">Gambar</option>
                <option value="VIDEO">Video</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend>Aturan</legend>
            <label>
              Wajib mengandung <span className="muted small">(semua kata, pisahkan dengan koma)</span>
              <input name="must_words" defaultValue={editing?.must_words.join(", ")} placeholder="mis. jual, jakarta" />
            </label>
            <label>
              Buang kalau mengandung <span className="muted small">(salah satu kata)</span>
              <input name="banned_words" defaultValue={editing?.banned_words.join(", ")} placeholder="mis. giveaway, link di bio, slot" />
            </label>
            <div className="grid2">
              <label>
                Panjang teks minimal
                <input type="number" name="min_length" min={0} defaultValue={editing?.min_length ?? 20} />
              </label>
              <label className="check">
                <input type="checkbox" name="exclude_replies" defaultChecked={editing?.exclude_replies ?? true} /> Abaikan balasan (reply)
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Kurasi AI {!aiEnabled() && <span className="pill warn">belum aktif</span>}</legend>
            <label>
              Post seperti apa yang kamu anggap bagus?
              <textarea
                name="curation_prompt"
                rows={4}
                defaultValue={editing?.curation_prompt}
                placeholder="mis. Orang yang menjual barang bekas pribadi (bukan toko), sebut harga & kondisi, lokasi Jabodetabek. Abaikan promo toko dan reseller."
              />
            </label>
            <label>
              Skor minimal untuk tampil di &quot;Terkurasi&quot; (0–100)
              <input type="number" name="min_score" min={0} max={100} defaultValue={editing?.min_score ?? 60} />
            </label>
          </fieldset>

          <div className="row">
            <SubmitButton className="btn primary" pendingText={editing ? "Menyimpan & menilai ulang…" : "Menyimpan & menarik post…"}>
              {editing ? "Simpan perubahan" : "Simpan & tarik post"}
            </SubmitButton>
            {editing && <Link href="/keywords" className="btn ghost">Batal</Link>}
          </div>
        </form>
      </section>
    </div>
  );
}
