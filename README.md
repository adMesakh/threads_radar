# Threads Radar

Website pribadi untuk menarik post Threads berdasarkan keyword, menyaringnya dengan aturan, lalu menilainya dengan AI (Claude) supaya yang muncul di tab **Terkurasi** hanya post yang sesuai kriteria kamu.

**Fitur**
- Kelola banyak keyword. Setiap keyword punya aturan dan kriteria kurasinya sendiri.
- Aturan: kata wajib, kata terlarang, panjang minimal, dan opsi abaikan reply.
- Kurasi AI: kamu tulis "post seperti apa yang bagus" dalam bahasa biasa, lalu AI memberi skor 0–100, alasan singkat, dan label.
- Tab Terkurasi / Semua / Disimpan / Dibuang, bisa diurutkan berdasarkan skor atau yang terbaru.
- Tarik post otomatis lewat cron, atau manual pakai tombol **Tarik post baru**.
- Website dilindungi password. Token Threads di-refresh otomatis.

Stack: Next.js 16, Postgres, Threads API, dan Claude API.

---

## 1. Coba dulu di lokal (tanpa API)

```bash
npm install
cp .env.example .env.local
# isi APP_PASSWORD, DATABASE_URL, set THREADS_MOCK=1
npm run dev
```

Buka http://localhost:3000, login, lalu tambah keyword. Dengan `THREADS_MOCK=1`, website memakai data contoh supaya kamu bisa mencoba alurnya. Tabel database dibuat otomatis.

## 2. Siapkan akses Threads API

1. Buka https://developers.facebook.com/apps, lalu **Create app** dengan use case **Access the Threads API**.
2. Di pengaturan use case, tambahkan permission **threads_basic** dan **threads_keyword_search**.
3. Di **App roles → Roles**, tambahkan akun Threads kamu sebagai **Threads Tester**. Setelah itu terima undangannya di aplikasi Threads (Settings → Account → Website permissions → Invites).
4. Buat access token, misalnya dengan **User Token Generator** di halaman use case atau dengan Graph API Explorer. Lalu tukar menjadi *long-lived token* (berlaku 60 hari):
   ```
   https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=APP_SECRET&access_token=SHORT_TOKEN
   ```
5. Masukkan hasilnya ke `THREADS_ACCESS_TOKEN`. Setelah itu website akan me-refresh token ini sendiri setiap minggu.

> ⚠️ **Penting:** sebelum permission `threads_keyword_search` disetujui lewat **App Review** Meta, pencarian hanya mengembalikan post milik akun kamu sendiri. Untuk mencari post publik, ajukan App Review untuk permission itu. Siapkan penjelasan use case dan screencast website ini.
>
> Batasnya: 2.200 query per 24 jam per akun. Pencarian yang tidak ada hasilnya tidak dihitung.

## 3. Kurasi AI (opsional)

Buat API key di https://console.anthropic.com lalu isi `ANTHROPIC_API_KEY`. Model default-nya `claude-haiku-5-5`, yang murah dan cepat. Post dinilai per batch berisi 20 post. Kalau key dikosongkan, website tetap jalan dengan filter aturan saja.

## 4. Deploy ke Vercel

1. Push folder ini ke GitHub, lalu import ke Vercel.
2. Database: di Vercel buka **Storage → Create → Neon (Postgres)**. `DATABASE_URL` akan terisi otomatis. Supabase juga bisa.
3. Isi Environment Variables: `APP_PASSWORD`, `THREADS_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, dan `CRON_SECRET` (string acak panjang).
4. Deploy.

**Jadwal otomatis:** `vercel.json` menjalankan cron setiap hari pukul 06.00 WIB (`0 23 * * *` UTC). Paket Vercel Hobby hanya mengizinkan cron sekali sehari. Kalau kamu pakai Pro, jadwalnya bisa diganti, misalnya `0 * * * *` untuk tiap jam. Di luar jadwal itu, pakai tombol **Tarik post baru**.

## Struktur

```
app/
  page.tsx            Feed (tab, filter, simpan/buang)
  keywords/page.tsx   Kelola keyword + aturan + kriteria AI
  login/page.tsx      Login password
  actions.ts          Server actions
  api/cron/route.ts   Endpoint cron
lib/
  threads.ts          Klien Threads API (+ refresh token, mode contoh)
  rules.ts            Filter aturan
  curate.ts           Penilaian AI via Claude (tool use → JSON)
  pipeline.ts         Tarik → filter → simpan → nilai
  db.ts               Koneksi Postgres + skema otomatis
```

## Catatan

- Mengedit keyword akan menghitung ulang aturan dan menilai ulang post yang ada.
- Post yang gagal aturan tetap disimpan dan terlihat di tab **Semua** beserta alasannya, jadi kamu bisa mengecek apakah aturannya terlalu ketat.
- Facebook Marketplace belum termasuk karena tidak punya API resmi. Kalau nanti mau ditambah, jalur yang paling aman adalah lewat scraper pihak ketiga seperti Apify, yang dimasukkan sebagai sumber data kedua di `lib/`.
