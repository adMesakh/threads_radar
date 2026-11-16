import type { SetupProblem } from "@/lib/setup";

export function SetupScreen({ problems }: { problems: SetupProblem[] }) {
  return (
    <div className="setup">
      <h1>Website belum siap dipakai</h1>
      <p className="muted">Perbaiki hal berikut di dashboard Vercel, lalu Redeploy:</p>
      <ol>
        {problems.map((p) => (
          <li key={p.title}>
            <b>{p.title}</b>
            <div className="muted small">{p.detail}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
