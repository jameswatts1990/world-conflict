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

// ---------------------------------------------------------------- Effects
const CC0 = 'CC0 1.0';
const USGOV = 'Public domain (US government work)';
// The USC sound effect archive: 1930s–80s Hollywood effects (USC Cinema and Sunset Editorial), restored by
// Craig Smith and published by the Internet Archive under CC0.
const USC = 'CC0 1.0 (USC sound effect archive)';
const IA = 'https://archive.org/download/';
const KENNEY_UI = 'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip';
const KENNEY_RPG = 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip';
const KENNEY_IMPACT = 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip';
const MORSE = `${IA}psalm-23-1-morse-code/Psalm23_1_CW.flac`;
const MORSE_PAGE = 'https://archive.org/details/psalm-23-1-morse-code';
// Off-air Morse, played faster (and so higher) than it was keyed, with the radio noise around the tone cut.
const MORSE_FILTERS = ['highpass=f=600', 'lowpass=f=2500'];
const RIFLE = `${IA}SSE_Library_GUNS/MECHANISM/GUNMech_Cocking%20bolt%20action%20rifle%3B%20indoors_CS_USC.flac`;
const BELLS_PAGE = 'https://archive.org/details/Red_Library_Bells_Horns_Whistles';

const kenney = (out, cue, title, url, page, zip, extra = {}) => ({
  out, cue, title, url, zip, page, author: 'Kenney (kenney.nl)', licence: CC0, ...extra,
});

const EFFECTS = [
  kenney('ui-click-1', 'ui.click', 'Mechanical switch', KENNEY_UI, 'https://kenney.nl/assets/ui-audio', 'Audio/switch11.ogg', { filters: ['lowpass=f=7000'] }),
  kenney('ui-click-2', 'ui.click', 'Mechanical switch', KENNEY_UI, 'https://kenney.nl/assets/ui-audio', 'Audio/switch28.ogg', { filters: ['lowpass=f=7000'] }),
  kenney('ui-click-3', 'ui.click', 'Mechanical switch', KENNEY_UI, 'https://kenney.nl/assets/ui-audio', 'Audio/switch30.ogg', { filters: ['lowpass=f=7000'] }),
  kenney('ui-tab', 'ui.tab', 'Page turn', KENNEY_RPG, 'https://kenney.nl/assets/rpg-audio', 'Audio/bookFlip3.ogg'),
  kenney('ui-error', 'ui.error', 'Dull thud', KENNEY_IMPACT, 'https://kenney.nl/assets/impact-sounds', 'Audio/impactSoft_heavy_003.ogg'),
  {
    out: 'ui-open', cue: 'ui.open', title: 'Unfolding a paper map', author: 'Spring Spring (OpenGameArt)', licence: CC0,
    url: 'https://opengameart.org/sites/default/files/snd_use_map.wav',
    page: 'https://opengameart.org/content/opening-and-closing-a-map-sounds',
    trim: [0.1, 0.9], fade: [0.01, 0.15],
  },
  {
    out: 'army-select-1', cue: 'army.select', title: 'Bolt-action rifle: bolt up and back', author: 'USC sound effect archive', licence: USC,
    url: RIFLE, page: 'https://archive.org/details/SSE_Library_GUNS', trim: [0.12, 0.52], fade: [0.005, 0.06],
  },
  {
    out: 'army-select-2', cue: 'army.select', title: 'Bolt-action rifle: bolt forward and down', author: 'USC sound effect archive', licence: USC,
    url: RIFLE, page: 'https://archive.org/details/SSE_Library_GUNS', trim: [0.52, 0.98], fade: [0.005, 0.06],
  },
  {
    out: 'army-order', cue: 'army.order', title: 'Morse acknowledgement (dit-dah)', author: 'Uploader "testhamradio" (Internet Archive)', licence: CC0,
    url: MORSE, page: MORSE_PAGE, trim: [15.58, 16.75], speed: 1.6, filters: MORSE_FILTERS, fade: [0.01, 0.05],
  },
  {
    out: 'report-1', cue: 'report', title: 'Morse traffic', author: 'Uploader "testhamradio" (Internet Archive)', licence: CC0,
    url: MORSE, page: MORSE_PAGE, trim: [16.85, 19.7], speed: 1.5, filters: MORSE_FILTERS, fade: [0.01, 0.08],
  },
  {
    out: 'report-2', cue: 'report', title: 'Morse traffic', author: 'Uploader "testhamradio" (Internet Archive)', licence: CC0,
    url: MORSE, page: MORSE_PAGE, trim: [11.38, 13.32], speed: 1.5, filters: MORSE_FILTERS, fade: [0.01, 0.08],
  },
  {
    out: 'report-bad', cue: 'report.bad', title: 'Hand-cranked alarm bell', author: 'USC sound effect archive', licence: USC,
    url: `${IA}SSE_Library_ALARMS/BELL/ALRMBell_Old%20style%20fire%20alarm%20bell%3B%20hand%20cranked_CS_USC.flac`,
    page: 'https://archive.org/details/SSE_Library_ALARMS', trim: [0.2, 1.8], fade: [0.01, 0.5],
  },
  {
    out: 'war', cue: 'war', title: '"To Arms" bugle call (opening)', author: 'United States Marine Band', licence: USGOV,
    url: `${IA}ToArms/to_arms.mp3`, page: 'https://archive.org/details/ToArms', trim: [0.2, 5.0], fade: [0.02, 0.4],
  },
  {
    out: 'peace', cue: 'peace', title: 'Many church bells ringing', author: 'USC sound effect archive', licence: USC,
    url: `${IA}Red_Library_Bells_Horns_Whistles/R28-05-Many%20Church%20Bells%20Ring.flac`, page: BELLS_PAGE,
    trim: [5.4, 13.0], fade: [0.3, 2.5],
  },
  {
    out: 'research', cue: 'research', title: 'Manual typewriter, then a signal bell', author: 'USC sound effect archive', licence: USC,
    url: `${IA}Red_Library_Communications/R20-02-Manual%20Typewriter.flac`, page: 'https://archive.org/details/Red_Library_Communications',
    trim: [1.0, 2.0], fade: [0.01, 0.1],
    layers: [
      {
        url: `${IA}SSE_Library_BELLS/MISC/BELLMisc-NAVY_Submarine%20signal%20bell_CS_USC.flac`,
        trim: [0.95, 3.0], fade: [0.005, 1.0], delay: 1.0, gain: -4,
      },
    ],
  },
  {
    out: 'construction', cue: 'construction', title: 'Blacksmith\'s hammer on an anvil', author: 'VishwaJai (OpenGameArt)', licence: CC0,
    url: 'https://opengameart.org/sites/default/files/blacksmithhammer.wav', page: 'https://opengameart.org/content/blacksmiths-hammer',
  },
  {
    out: 'recruitment', cue: 'recruitment', title: 'Troops marching in step', author: 'USC sound effect archive', licence: USC,
    url: `${IA}Red_Library_Footsteps_3/R11-19-Army%20Marching%20Steadily.flac`, page: 'https://archive.org/details/Red_Library_Footsteps_3',
    trim: [10.0, 12.8], fade: [0.3, 0.6],
  },
  {
    out: 'capture-won', cue: 'capture.won', title: 'Ruffles and flourishes (first)', author: 'United States Marine Band', licence: USGOV,
    url: `${IA}RufflesAndFlourishes/Ruffles_and_Flourishes.mp3`, page: 'https://archive.org/details/RufflesAndFlourishes',
    trim: [0.7, 2.9], fade: [0.02, 0.3],
  },
  {
    out: 'capture-lost', cue: 'capture.lost', title: 'Gong', author: 'USC sound effect archive', licence: USC,
    url: `${IA}Red_Library_Music/R05-02-Gong%20Hit.flac`, page: 'https://archive.org/details/Red_Library_Music',
    trim: [0.2, 5.0], fade: [0.005, 2.0],
  },
  {
    out: 'battle', cue: 'battle', title: 'Cannon shot', author: 'USC sound effect archive', licence: USC,
    url: `${IA}SSE_Library_GUNS/CANNON/GUNCano_Cannon%20shot_CS_USC.flac`, page: 'https://archive.org/details/SSE_Library_GUNS',
    trim: [0, 3.5], fade: [0.005, 1.0],
  },
  {
    out: 'rout', cue: 'rout', title: 'Whistle blast', author: 'USC sound effect archive', licence: USC,
    url: `${IA}Red_Library_Bells_Horns_Whistles/R21-45-High-Pitched%20Whistle.flac`, page: BELLS_PAGE,
    trim: [1.65, 3.2], fade: [0.01, 0.15],
  },
  {
    out: 'campaign-start', cue: 'campaign.start', title: '"Reveille" bugle call (first part)', author: 'U.S. Army Bands', licence: USGOV,
    url: `${IA}Reveille/reveille.mp3`, page: 'https://archive.org/details/Reveille', trim: [0.6, 7.1], fade: [0.02, 0.3],
  },
  {
    out: 'victory', cue: 'victory', title: '"To the Colors" bugle call', author: 'U.S. Army Bands', licence: USGOV,
    url: `${IA}ToTheColors/To_The_Color.mp3`, page: 'https://archive.org/details/ToTheColors', trim: [0.5, 16.2], fade: [0.02, 1.2],
  },
  {
    out: 'defeat', cue: 'defeat', title: '"Taps" bugle call (first phrases)', author: 'U.S. Army Bands', licence: USGOV,
    url: `${IA}TapsBugleCall/taps.mp3`, page: 'https://archive.org/details/TapsBugleCall', trim: [0.7, 15.2], fade: [0.02, 1.0],
  },
  {
    out: 'battle-loop', kind: 'loop', title: 'Distant bombardment (loop)', author: 'USC sound effect archive', licence: USC,
    url: `${IA}SSE_Library_GUNS/CANNON/GUNCano_Bombardment%20with%20distant%20explosions%3B%20Good_CHS_USC.flac`,
    page: 'https://archive.org/details/SSE_Library_GUNS', trim: [59, 89], crossfade: 2,
    // Further away: less of the crack, more of the rumble.
    filters: ['lowpass=f=3000'],
  },
].map((e) => ({ kind: 'effect', ...e }));

export const SOURCES = [...EFFECTS, ...MUSIC];

/** Local file name for a download: readable, and unique per URL. */
export function rawName(url) {
  const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'download').replace(/[^\w.-]+/g, '_');
  return `${createHash('sha1').update(url).digest('hex').slice(0, 8)}-${base}`;
}
