"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <div className="login">
      <h1>Masuk</h1>
      <p className="muted">Website ini pribadi. Masukkan password yang kamu set di <code>APP_PASSWORD</code>.</p>
      <form action={action} className="stack">
        <input type="password" name="password" placeholder="Password" autoFocus required />
        {state?.error && <p className="error">{state.error}</p>}
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
