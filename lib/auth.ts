import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE = "tr_session";

function expected(): string {
  const pw = process.env.APP_PASSWORD;
  if (!pw) throw new Error("APP_PASSWORD belum diisi");
  return createHash("sha256").update(`threads-radar:${pw}`).digest("hex");
}

export function passwordMatches(input: string): boolean {
  const a = createHash("sha256").update(`threads-radar:${input}`).digest();
  const b = Buffer.from(expected(), "hex");
  return timingSafeEqual(a, b);
}

export async function isAuthed(): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && c === expected();
}

export async function requireAuth() {
  if (!(await isAuthed())) redirect("/login");
}

export async function setSession() {
  (await cookies()).set(COOKIE, expected(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
