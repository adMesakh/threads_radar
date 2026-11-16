import type { Metadata } from "next";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { logout } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threads Radar",
  description: "Pantau & kurasi post Threads berdasarkan keyword",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthed().catch(() => false);
  return (
    <html lang="id">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-dot" aria-hidden /> Threads Radar
          </Link>
          {authed && (
            <nav>
              <Link href="/">Feed</Link>
              <Link href="/keywords">Keyword</Link>
              <form action={logout}>
                <button className="link-btn" type="submit">Keluar</button>
              </form>
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
