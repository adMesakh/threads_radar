import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __sql?: Sql; __schemaReady?: Promise<void> };

export function db(): Sql {
  if (!g.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum diisi");
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    g.__sql = postgres(url, {
      ssl: isLocal ? false : "require",
      max: 5,
      prepare: false, // aman untuk pooler Supabase/Neon
    });
  }
  return g.__sql;
}

/** Membuat tabel otomatis saat pertama dipakai, jadi tidak perlu migrasi manual. */
export function ensureSchema(): Promise<void> {
  if (!g.__schemaReady) {
    const sql = db();
    g.__schemaReady = (async () => {
      await sql`
        create table if not exists keywords (
          id serial primary key,
          query text not null,
          search_type text not null default 'RECENT',
          media_type text,
          must_words text[] not null default '{}',
          banned_words text[] not null default '{}',
          exclude_replies boolean not null default true,
          min_length int not null default 0,
          curation_prompt text not null default '',
          min_score int not null default 60,
          active boolean not null default true,
          created_at timestamptz not null default now(),
          last_fetched_at timestamptz
        )`;
      await sql`
        create table if not exists posts (
          keyword_id int not null references keywords(id) on delete cascade,
          id text not null,
          text text,
          media_type text,
          permalink text,
          username text,
          posted_at timestamptz,
          is_reply boolean not null default false,
          is_quote_post boolean not null default false,
          fetched_at timestamptz not null default now(),
          rule_pass boolean not null,
          rule_reason text,
          ai_score int,
          ai_reason text,
          ai_tags text[] not null default '{}',
          ai_scored_at timestamptz,
          status text not null default 'new',
          primary key (keyword_id, id)
        )`;
      await sql`create index if not exists posts_feed_idx on posts (keyword_id, posted_at desc)`;
      await sql`
        create table if not exists settings (
          key text primary key,
          value text not null,
          updated_at timestamptz not null default now()
        )`;
      await sql`
        create table if not exists fetch_runs (
          id serial primary key,
          started_at timestamptz not null default now(),
          finished_at timestamptz,
          trigger text not null,
          summary jsonb
        )`;
    })().catch((e) => {
      g.__schemaReady = undefined;
      throw e;
    });
  }
  return g.__schemaReady;
}

export async function getSetting(key: string): Promise<{ value: string; updated_at: Date } | null> {
  const rows = await db()`select value, updated_at from settings where key = ${key}`;
  return (rows[0] as { value: string; updated_at: Date } | undefined) ?? null;
}

export async function setSetting(key: string, value: string) {
  await db()`
    insert into settings (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export type Keyword = {
  id: number;
  query: string;
  search_type: "RECENT" | "TOP";
  media_type: "TEXT" | "IMAGE" | "VIDEO" | null;
  must_words: string[];
  banned_words: string[];
  exclude_replies: boolean;
  min_length: number;
  curation_prompt: string;
  min_score: number;
  active: boolean;
  created_at: Date;
  last_fetched_at: Date | null;
};

export type Post = {
  keyword_id: number;
  id: string;
  text: string | null;
  media_type: string | null;
  permalink: string | null;
  username: string | null;
  posted_at: Date | null;
  is_reply: boolean;
  is_quote_post: boolean;
  fetched_at: Date;
  rule_pass: boolean;
  rule_reason: string | null;
  ai_score: number | null;
  ai_reason: string | null;
  ai_tags: string[];
  status: "new" | "saved" | "hidden";
};
