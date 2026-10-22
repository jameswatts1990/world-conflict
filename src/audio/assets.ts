// The recordings behind each cue and the music, as written by `npm run audio:build` from
// scripts/audio/sources.mjs (sources and licences: docs/ATTRIBUTION.md). Files are fetched
// only when first needed: effects after the first click, each music track when it plays.
import type { NationId } from '../sim';
import type { CueId } from './cues';
import type { AudioLibrary } from './engine';
import library from './files/library.json';

interface LibraryFile {
  cues: Partial<Record<CueId, string[]>>;
  battleLoop: string | null;
  music: { file: string; title: string; nations?: string[]; menu?: boolean }[];
}

const urls = import.meta.glob<string>('./files/*.mp3', { eager: true, query: '?url', import: 'default' });
const url = (name: string): string => urls[`./files/${name}.mp3`];

const lib = library as LibraryFile;

export const AUDIO_LIBRARY: AudioLibrary = {
  cues: Object.fromEntries(Object.entries(lib.cues).map(([cue, names]) => [cue, names!.map(url)])),
  battleLoop: lib.battleLoop ? url(lib.battleLoop) : undefined,
  music: lib.music.map((t) => ({ url: url(t.file), title: t.title, nations: t.nations as NationId[] | undefined, menu: t.menu })),
};
