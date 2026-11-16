import { ensureSchema } from "./db";

/** Nama-nama variabel yang biasa dibuat integrasi Neon / Vercel Postgres / Supabase. */
const DB_VARS = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_PRISMA_URL", "STORAGE_URL"];

export function databaseUrl(): string | undefined {
  for (const k of DB_VARS) if (process.env[k]) return process.env[k];
  // Integrasi dengan prefix custom, mis. MYDB_DATABASE_URL
  const custom = Object.keys(process.env).find((k) => /_(DATABASE_URL|POSTGRES_URL)$/.test(k) && process.env[k]);
  return custom ? process.env[custom] : undefined;
}

export type SetupProblem = { title: string; detail: string };

/** Cek konfigurasi; mengembalikan daftar masalah (kosong = aman). */
export async function checkSetup(): Promise<SetupProblem[]> {
  const problems: SetupProblem[] = [];
  if (!process.env.APP_PASSWORD) {
    problems.push({ title: "APP_PASSWORD belum diisi", detail: "Tambahkan di Settings → Environment Variables, lalu Redeploy." });
  }
  if (!databaseUrl()) {
    problems.push({
      title: "Database belum tersambung",
      detail: "Buka tab Storage → Create Database → Neon → Connect ke project ini, lalu Redeploy. Variabel DATABASE_URL akan terisi otomatis.",
    });
  } else {
    try {
      await ensureSchema();
    } catch (e) {
      problems.push({ title: "Tidak bisa terhubung ke database", detail: (e as Error).message });
    }
  }
  return problems;
}
