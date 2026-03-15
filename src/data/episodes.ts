export type Episode = {
  id: string;
  title: string;
  description: string;
  hlsPath: string;
};

export const episodes: Episode[] = [
  {
    id: "episode-1",
    title: "Odcinek 1",
    description: "Wprowadzenie do serii.",
    hlsPath: "/hls/episode-1/master.m3u8",
  },
  {
    id: "episode-2",
    title: "Odcinek 2",
    description: "Kontynuacja historii.",
    hlsPath: "/hls/episode-2/master.m3u8",
  },
  {
    id: "episode-3",
    title: "Odcinek 3",
    description: "Finał pierwszego mini-arku.",
    hlsPath: "/hls/episode-3/master.m3u8",
  },
];

export function getEpisodeById(episodeId: string): Episode | undefined {
  return episodes.find((episode) => episode.id === episodeId);
}
