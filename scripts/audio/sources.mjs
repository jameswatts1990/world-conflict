// Every recording in the game: where it comes from, its licence, and how it is cut.
// `npm run audio:fetch` downloads each `url`; `npm run audio:build` processes them into src/audio/files/.
//
// Fields: out (file name, no extension), kind ('effect' | 'loop' | 'music'), cue (effects), title, author,
// licence, page (where the licence is stated), url (download), zip (entry inside a zip download),
// trim [start, end] seconds, fade [in, out] seconds, gain (dB, effects), filters (extra FFmpeg filters),
// speed (playback-rate correction for a disc transferred at the wrong speed), stereo, bitrate; music also
// nations, menu and `why` (the public-domain reasoning).
import { createHash } from 'node:crypto';

// Old 78 rpm transfers: cut the rumble and the hiss above the band's range (acoustic records carry little
// above 5 kHz), then level. Holst's acoustic set was transferred about 4% slow; `speed` corrects it.
const DISC = ['highpass=f=45', 'lowpass=f=6000'];
const PD = 'Public domain';
const HOLST_URL =
  'https://archive.org/download/1923-the-planets-holst-acoustic-vresion-with-marching-song-holst-conducting-uk-c/' +
  '1923%20The%20Planets%20-%20Holst%20-%20acoustic%20vresion%20-%20with%20Marching%20Song%20-%20Holst%20Conducting%20-%20UK%20Columbia%20L%201543%20-%2014%20sides.flac';
const HOLST_PAGE = 'https://archive.org/details/1923-the-planets-holst-acoustic-vresion-with-marching-song-holst-conducting-uk-c';
const HOLST_WHY =
  'Holst (d. 1934), The Planets, published 1921. Acoustic recording, LSO conducted by Holst, UK Columbia, issued 1923 ' +
  '(item metadata and description; marked with the Public Domain Mark). Not the 1926 electrical remake.';

const MUSIC = [
  {
    out: 'music-menu-mars',
    trim: [0.6, 385.4],
    fade: [0.5, 2],
    title: 'Holst, "Mars, the Bringer of War" (The Planets)',
    author: 'Gustav Holst; London Symphony Orchestra conducted by the composer (Columbia, 1923)',
    url: HOLST_URL,
    page: HOLST_PAGE,
    menu: true,
    speed: 1.039,
    why: HOLST_WHY,
  },
  {
    out: 'music-venus',
    trim: [387.3, 878],
    fade: [0.5, 4],
    title: 'Holst, "Venus, the Bringer of Peace" (The Planets)',
    author: 'Gustav Holst; London Symphony Orchestra conducted by the composer (Columbia, 1923)',
    url: HOLST_URL,
    page: HOLST_PAGE,
    speed: 1.032,
    why: HOLST_WHY,
  },
  {
    out: 'music-uk-colonel-bogey',
    trim: [4.8, 169.4],
    title: 'Alford, "Colonel Bogey" march',
    author: 'Kenneth J. Alford; The Guards Silver Band (Beltona, 1922)',
    url: 'https://archive.org/download/78_colonel-bogey_the-guards-silver-band-k-j-afford_gbia3014344b/COLONEL%20BOGEY%20-%20The%20GUARDS%20SILVER%20BAND%20-%20K.%20J.%20Afford.mp3',
    page: 'https://archive.org/details/78_colonel-bogey_the-guards-silver-band-k-j-afford_gbia3014344b',
    nations: ['uk'],
    why: 'Alford (d. 1945), published 1914. Acoustic disc, Beltona matrix 2632, dated 1922 (Great 78 Project).',
  },
  {
    out: 'music-fr-pere-la-victoire',
    trim: [2.0, 209.0],
    title: 'Ganne, "Le Père la Victoire" march',
    author: 'Louis Ganne; United States Marine Band (Edison 51311, 1923)',
    url: 'https://archive.org/download/edison-51311_01_9196/cusb_ed_51311_01_9196_0b.flac',
    page: 'https://archive.org/details/edison-51311_01_9196',
    nations: ['fr'],
    why: 'Ganne (d. 1923), published 1888. Recorded 9 October 1923, Edison matrix 9196 (UCSB Edison collection); a Great 78 copy of the issued disc is dated 1923.',
  },
  {
    out: 'music-de-alte-kameraden',
    trim: [5.6, 245.9],
    title: 'Teike, "Alte Kameraden" march',
    author: 'Carl Teike; United States Marine Band (Edison 50895, 1921)',
    url: 'https://archive.org/download/78_old-comrades-march_united-states-marine-band-c-teike_gbia0023213b/Old%20Comrades%20March%20-%20United%20States%20Marine%20Band.mp3',
    page: 'https://archive.org/details/78_old-comrades-march_united-states-marine-band-c-teike_gbia0023213b',
    nations: ['de'],
    why: 'Teike (d. 1922), published 1889. Recorded 5 October 1921, Edison matrix 8239, disc dated 1921 (Great 78 Project; UCSB Edison collection).',
  },
  {
    out: 'music-it-aida',
    trim: [1.8, 224.1],
    title: 'Verdi, Triumphal March from "Aida"',
    author: "Giuseppe Verdi; Sodero's Band (Edison 80371, 1917)",
    url: 'https://archive.org/download/edison-80371_01_5321/cusb_ed_80371_01_5321_0c.flac',
    page: 'https://archive.org/details/edison-80371_01_5321',
    nations: ['it'],
    why: 'Verdi (d. 1901), published 1872. Recorded 25 January 1917, Edison matrix 5321 (UCSB Edison collection); Great 78 copies of the issued disc are dated 1917.',
  },
  {
    out: 'music-es-sevilla',
    trim: [3.4, 232.6],
    title: 'Albéniz, "Sevilla" (Suite española)',
    author: 'Isaac Albéniz; Banda Municipal de Madrid conducted by Ricardo Villa (Odeon, 1922)',
    url: 'https://archive.org/download/78_sevilla_banda-municipal-de-madrid-albeniz-mtro-ricardo-villa_gbia0038713b/Sevilla%20-%20Banda%20Municipal%20de%20Madrid%20-%20Albeniz.mp3',
    page: 'https://archive.org/details/78_sevilla_banda-municipal-de-madrid-albeniz-mtro-ricardo-villa_gbia0038713b',
    nations: ['es'],
    why: 'Albéniz (d. 1909), published 1886; band transcription performed under Villa (d. 1935). Odeon matrix XXS 4801, dated 1922 (Great 78 Project).',
  },
  {
    out: 'music-pl-polonaise',
    trim: [6.3, 253.1],
    title: 'Chopin, Polonaise in A major, Op. 40 No. 1 "Military"',
    author: 'Frédéric Chopin; United States Marine Band (Edison 50922, 1922)',
    url: 'https://archive.org/download/78_polonaise-militaire_united-states-marine-band-chopin_gbia0276598a/POLONAISE%20MILITAIRE%20-%20UNITED%20STATES%20MARINE%20BAND.mp3',
    page: 'https://archive.org/details/78_polonaise-militaire_united-states-marine-band-chopin_gbia0276598a',
    nations: ['pl'],
    why: 'Chopin (d. 1849), published 1840. Recorded 11 October 1921, Edison matrix 8248, disc dated 1922 (Great 78 Project; UCSB Edison collection).',
  },
  {
    out: 'music-granada',
    trim: [3.0, 255.5],
    title: 'Albéniz, "Granada" (Suite española)',
    author: 'Isaac Albéniz; Banda Municipal de Madrid conducted by Ricardo Villa (Odeon, 1922)',
    url: 'https://archive.org/download/78_granada_banda-municipal-de-madrid-albeniz-mtro-ricardo-villa_gbia0038713a/Granada%20-%20Banda%20Municipal%20de%20Madrid%20-%20Albeniz.mp3',
    page: 'https://archive.org/details/78_granada_banda-municipal-de-madrid-albeniz-mtro-ricardo-villa_gbia0038713a',
    why: 'Albéniz (d. 1909), published 1886; band transcription performed under Villa (d. 1935). Odeon matrix XXS 4788, dated 1922 (Great 78 Project).',
  },
].map((m) => ({
  kind: 'music',
  licence: PD,
  fade: [0.3, 2],
  filters: m.out.includes('mars') || m.out.includes('venus') ? ['highpass=f=45'] : DISC,
  ...m,
}));

export const SOURCES = [...MUSIC];

/** Local file name for a download: readable, and unique per URL. */
export function rawName(url) {
  const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download').replace(/[^\w.-]+/g, '_');
  return `${createHash('sha1').update(url).digest('hex').slice(0, 8)}-${base}`;
}
