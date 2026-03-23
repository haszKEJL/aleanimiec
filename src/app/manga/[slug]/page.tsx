import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeriesBySlug } from "@/lib/manga-cms-store";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function MangaSeriesPage({ params }: Props) {
  const { slug } = await params;
  const data = await getSeriesBySlug(slug);

  if (!data) {
    notFound();
  }

  const { series, chapters } = data;

  return (
    <section className="manga-series-root">
      <header className="manga-series-hero">
        <div className="manga-series-hero__cover-wrap">{series.coverUrl ? <img src={series.coverUrl} alt={`Okładka ${series.title}`} className="manga-series-hero__cover" /> : null}</div>
        <div className="manga-series-hero__body">
          <p className="manga-brand">Seria</p>
          <h1>{series.title}</h1>
          <p className="muted">{series.description || "Brak opisu."}</p>
          <p className="manga-card__meta">status: {series.status} · rozdziały: {chapters.length}</p>
          {series.tags.length ? (
            <div className="manga-card__tags">
              {series.tags.map((tag) => (
                <span key={`${series.id}-${tag}`} className="manga-tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="manga-series-toolbar">
        <Link href="/manga" className="btn btn-ghost">
          Wróć do listy
        </Link>
      </div>

      <section className="manga-series-chapters">
        <h2>Rozdziały</h2>
        {!chapters.length ? <p className="muted">Brak opublikowanych rozdziałów.</p> : null}
        {chapters.length ? (
          <ul className="manga-series-chapters__list">
            {chapters.map((chapter) => (
              <li key={chapter.id}>
                <Link href={`/manga/${series.slug}/${chapter.id}`}>
                  <span>Rozdział {chapter.number}</span>
                  <strong>{chapter.title}</strong>
                  <span>{new Date(chapter.createdAt).toLocaleDateString("pl-PL")}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  );
}