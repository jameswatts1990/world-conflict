// Every recording in the game: where it comes from, its licence, and how it is cut.
// `npm run audio:fetch` downloads each `url`; `npm run audio:build` processes them into src/audio/files/.
//
// Fields: out (file name, no extension), kind ('effect' | 'loop' | 'music'), cue (effects), title, author,
// licence, page (where the licence is stated), url (download), zip (entry inside a zip download),
// trim [start, end] seconds, fade [in, out] seconds, gain (dB, effects), filters (extra FFmpeg filters),
// stereo, bitrate; music also nations, menu and `why` (the public-domain reasoning).
import { createHash } from 'node:crypto';

export const SOURCES = [];

/** Local file name for a download: readable, and unique per URL. */
export function rawName(url) {
  const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download').replace(/[^\w.-]+/g, '_');
  return `${createHash('sha1').update(url).digest('hex').slice(0, 8)}-${base}`;
}
