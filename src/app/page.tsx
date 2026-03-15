import Link from "next/link";
import { episodes } from "@/data/episodes";

export default function HomePage() {
  return (
    <section>
      <h1>Lista odcinków</h1>
      <p className="muted">Wybierz odcinek, aby rozpocząć odtwarzanie HLS.</p>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        {episodes.map((episode) => (
          <article key={episode.id} className="card">
            <h2 style={{ marginTop: 0 }}>{episode.title}</h2>
            <p className="muted">{episode.description}</p>
            <Link href={`/watch/${episode.id}`} className="btn" style={{ display: "inline-block" }}>
              Oglądaj
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
