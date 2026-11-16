"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, ensureSchema, type Keyword } from "@/lib/db";
import { requireAuth, passwordMatches, setSession, clearSession } from "@/lib/auth";
import { runFetch, reapplyRules, scorePending } from "@/lib/pipeline";

export async function login(_: unknown, form: FormData) {
  const pw = String(form.get("password") ?? "");
  if (!process.env.APP_PASSWORD) return { error: "APP_PASSWORD belum diisi di Environment Variables Vercel (lalu Redeploy)." };
  if (!passwordMatches(pw)) return { error: "Password salah" };
  await setSession();
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

export async function refreshNow(form: FormData) {
  await requireAuth();
  const id = Number(form.get("keyword_id")) || undefined;
  await runFetch("manual", id);
  revalidatePath("/");
}

export async function setStatus(form: FormData) {
  await requireAuth();
  const status = String(form.get("status"));
  if (!["new", "saved", "hidden"].includes(status)) return;
  await db()`
    update posts set status = ${status}
    where keyword_id = ${Number(form.get("keyword_id"))} and id = ${String(form.get("id"))}`;
  revalidatePath("/");
}

const words = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

export async function saveKeyword(form: FormData) {
  await requireAuth();
  await ensureSchema();
  const sql = db();
  const id = Number(form.get("id")) || null;
  const query = String(form.get("query") ?? "").trim();
  if (!query) return;
  const media = String(form.get("media_type") ?? "");
  const data = {
    query,
    search_type: form.get("search_type") === "TOP" ? "TOP" : "RECENT",
    media_type: ["TEXT", "IMAGE", "VIDEO"].includes(media) ? media : null,
    must_words: words(form.get("must_words")),
    banned_words: words(form.get("banned_words")),
    exclude_replies: form.get("exclude_replies") === "on",
    min_length: Math.max(0, Number(form.get("min_length")) || 0),
    curation_prompt: String(form.get("curation_prompt") ?? "").trim(),
    min_score: Math.max(0, Math.min(100, Number(form.get("min_score")) || 0)),
  };

  let k: Keyword;
  if (id) {
    const [row] = await sql`
      update keywords set ${sql(data)} where id = ${id} returning *`;
    k = row as unknown as Keyword;
    // Aturan/kriteria berubah → hitung ulang aturan & nilai ulang dengan AI
    await reapplyRules(k);
    await sql`update posts set ai_score = null, ai_reason = null, ai_tags = '{}' where keyword_id = ${id}`;
    await scorePending(k);
  } else {
    const [row] = await sql`insert into keywords ${sql(data)} returning *`;
    k = row as unknown as Keyword;
    await runFetch("manual", k.id);
  }
  revalidatePath("/", "layout");
  redirect("/keywords");
}

export async function toggleKeyword(form: FormData) {
  await requireAuth();
  await db()`update keywords set active = not active where id = ${Number(form.get("id"))}`;
  revalidatePath("/", "layout");
}

export async function deleteKeyword(form: FormData) {
  await requireAuth();
  await db()`delete from keywords where id = ${Number(form.get("id"))}`;
  revalidatePath("/", "layout");
}
