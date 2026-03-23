import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeriesBySlug } from "@/lib/manga-cms-store";

type Props = {
  params: Promise<{
    slug: string;
    chapterId: string;
  }>;
};

export default async function MangaReaderPage({ params }: Props) {
  const { slug, chapterId } = await params;
  const data = await getSeriesBySlug(slug);

  if (!data) {
    notFound();
  }

  const { series, chapters } = data;
  const currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (currentIndex === -1) {
    notFound();
  }

  const chapter = chapters[currentIndex];
  const newer = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const older = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  return (
    <section className="manga-reader-root">
      <header className="manga-reader-head">
        <div>
          <p className="manga-brand">Czytnik</p>
          <h1>{series.title}</h1>
          <p className="muted">
            Rozdział {chapter.number}: {chapter.title}
          </p>
        </div>
        <div className="manga-reader-nav">
          <Link href={`/manga/${series.slug}`} className="btn btn-ghost">
            Lista rozdziałów
          </Link>
          {newer ? (
            <Link href={`/manga/${series.slug}/${newer.id}`} className="btn btn-ghost">
              Nowszy
            </Link>
          ) : null}
          {older ? (
            <Link href={`/manga/${series.slug}/${older.id}`} className="btn btn-ghost">
              Starszy
            </Link>
          ) : null}
        </div>
      </header>

      <div className="manga-reader-pages">
        {chapter.pages.map((pageUrl, index) => (
          <figure key={`${chapter.id}-${pageUrl}`} className="manga-reader-page">
            <img src={pageUrl} alt={`${series.title} rozdział ${chapter.number} strona ${index + 1}`} loading="lazy" />
          </figure>
        ))}
      </div>
    </section>
  );
}