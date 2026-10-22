# Data sources and attribution

## Map geometry

Made with **Natural Earth**. Free vector and raster map data @ [naturalearthdata.com](https://www.naturalearthdata.com/).

- `ne_10m_admin_1_states_provinces` (v5.1.2): province shapes, built by merging admin-1 units into game provinces,
  and the world context outside the playable theatre, built by merging the remaining units into countries

Natural Earth data is in the **public domain**
([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)). The source repository is
[nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector), tag `v5.1.2`.

### How the bundled files were produced

1. `npm run map:fetch` downloads the GeoJSON file listed above into `data-src/` (git-ignored).
2. `npm run map:build` (`scripts/map/build-map.mjs`, using [mapshaper](https://github.com/mbloch/mapshaper),
   MPL-2.0, as a build-time tool only):
   - assigns each admin-1 unit to a game province using `scripts/map/province-sources.mjs`; every other unit (and
     any unit of a theatre country that no province claims, such as overseas territories) goes to its country
   - simplifies each unit by its distance from the theatre (about 3 km detail in and around it, coarser further
     away; distant islets are dropped), then dissolves units into provinces and countries, drops islets under
     120 km² and cleans topology; Antarctica is removed
   - writes `src/assets/map/map.topo.json` with two objects, `provinces` (50) and `countries`, in one topology, so
     every coast and border the two share is the same line

Shapes are simplified for a strategy map. Borders are modern borders as published by Natural Earth. Province
groupings, names and all gameplay data are original to this project.

The bundled files contain only geometry and ids. Province adjacency is defined separately, by hand, in
`src/sim/scenario/europe/connections.ts`.

## Sound and music

Every recording is **CC0** (public domain dedication) or **public domain**:

- **Music**: recordings issued in 1925 or earlier (public domain in the United States since 2026, and long expired
  in the UK and EU, where recordings published before 1963 are out of copyright) of works whose composers all died
  before 1956. The evidence for each track (label, matrix, recording date, composer's death) is recorded next to
  it in `scripts/audio/sources.mjs`.
- **Bugle calls and drums**: official recordings by U.S. Army Bands and the United States Marine Band, works of
  the United States government and so in the public domain.
- **Interface sounds**: CC0 packs by [Kenney](https://kenney.nl) and CC0 recordings from
  [OpenGameArt](https://opengameart.org); the Morse is a CC0 off-air recording on the Internet Archive.
- **Guns, bells, typewriter, marching, gong and whistle**: the USC sound effect archive (USC Cinema and Sunset
  Editorial libraries, 1930s–80s, restored by Craig Smith), published by the Internet Archive under CC0. That is
  the archive's own statement; the rights chain back to the original studios is not documented.

### How the bundled files were produced

1. `npm run audio:fetch` downloads every source listed in `scripts/audio/sources.mjs` into `data-src/audio/`
   (git-ignored).
2. `npm run audio:build` (`scripts/audio/build.mjs`, using [FFmpeg](https://ffmpeg.org/) as a build-time tool)
   trims each recording, levels it (effects to a -1 dBFS peak, music to -20 LUFS), cross-fades the battle loop so it
   repeats without a seam, encodes MP3 into `src/audio/files/` and rewrites the table below.

<!-- audio:start -->
| File | What | By | Licence | |
| --- | --- | --- | --- | --- |
| `ui-click-1.mp3` | Mechanical switch | Kenney (kenney.nl) | CC0 1.0 | [source](https://kenney.nl/assets/ui-audio) |
| `ui-click-2.mp3` | Mechanical switch | Kenney (kenney.nl) | CC0 1.0 | [source](https://kenney.nl/assets/ui-audio) |
| `ui-click-3.mp3` | Mechanical switch | Kenney (kenney.nl) | CC0 1.0 | [source](https://kenney.nl/assets/ui-audio) |
| `ui-tab.mp3` | Page turn | Kenney (kenney.nl) | CC0 1.0 | [source](https://kenney.nl/assets/rpg-audio) |
| `ui-error.mp3` | Dull thud | Kenney (kenney.nl) | CC0 1.0 | [source](https://kenney.nl/assets/impact-sounds) |
| `ui-open.mp3` | Unfolding a paper map | Spring Spring (OpenGameArt) | CC0 1.0 | [source](https://opengameart.org/content/opening-and-closing-a-map-sounds) |
| `army-select-1.mp3` | Bolt-action rifle: bolt up and back | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/SSE_Library_GUNS) |
| `army-select-2.mp3` | Bolt-action rifle: bolt forward and down | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/SSE_Library_GUNS) |
| `army-order.mp3` | Morse acknowledgement (dit-dah) | Uploader "testhamradio" (Internet Archive) | CC0 1.0 | [source](https://archive.org/details/psalm-23-1-morse-code) |
| `report-1.mp3` | Morse traffic | Uploader "testhamradio" (Internet Archive) | CC0 1.0 | [source](https://archive.org/details/psalm-23-1-morse-code) |
| `report-2.mp3` | Morse traffic | Uploader "testhamradio" (Internet Archive) | CC0 1.0 | [source](https://archive.org/details/psalm-23-1-morse-code) |
| `report-bad.mp3` | Hand-cranked alarm bell | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/SSE_Library_ALARMS) |
| `war.mp3` | "To Arms" bugle call (opening) | United States Marine Band | Public domain (US government work) | [source](https://archive.org/details/ToArms) |
| `peace.mp3` | Many church bells ringing | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/Red_Library_Bells_Horns_Whistles) |
| `research.mp3` | Manual typewriter, then a signal bell | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/Red_Library_Communications) |
| `construction.mp3` | Blacksmith's hammer on an anvil | VishwaJai (OpenGameArt) | CC0 1.0 | [source](https://opengameart.org/content/blacksmiths-hammer) |
| `recruitment.mp3` | Troops marching in step | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/Red_Library_Footsteps_3) |
| `capture-won.mp3` | Ruffles and flourishes (first) | United States Marine Band | Public domain (US government work) | [source](https://archive.org/details/RufflesAndFlourishes) |
| `capture-lost.mp3` | Gong | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/Red_Library_Music) |
| `battle.mp3` | Cannon shot | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/SSE_Library_GUNS) |
| `rout.mp3` | Whistle blast | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/Red_Library_Bells_Horns_Whistles) |
| `campaign-start.mp3` | "Reveille" bugle call (first part) | U.S. Army Bands | Public domain (US government work) | [source](https://archive.org/details/Reveille) |
| `victory.mp3` | "To the Colors" bugle call | U.S. Army Bands | Public domain (US government work) | [source](https://archive.org/details/ToTheColors) |
| `defeat.mp3` | "Taps" bugle call (first phrases) | U.S. Army Bands | Public domain (US government work) | [source](https://archive.org/details/TapsBugleCall) |
| `battle-loop.mp3` | Distant bombardment (loop) | USC sound effect archive | CC0 1.0 (USC sound effect archive) | [source](https://archive.org/details/SSE_Library_GUNS) |
| `music-menu-mars.mp3` | Holst, "Mars, the Bringer of War" (The Planets) | Gustav Holst; London Symphony Orchestra conducted by the composer (Columbia, 1923) | Public domain | [source](https://archive.org/details/1923-the-planets-holst-acoustic-vresion-with-marching-song-holst-conducting-uk-c) |
| `music-venus.mp3` | Holst, "Venus, the Bringer of Peace" (The Planets) | Gustav Holst; London Symphony Orchestra conducted by the composer (Columbia, 1923) | Public domain | [source](https://archive.org/details/1923-the-planets-holst-acoustic-vresion-with-marching-song-holst-conducting-uk-c) |
| `music-uk-colonel-bogey.mp3` | Alford, "Colonel Bogey" march | Kenneth J. Alford; The Guards Silver Band (Beltona, 1922) | Public domain | [source](https://archive.org/details/78_colonel-bogey_the-guards-silver-band-k-j-afford_gbia3014344b) |
| `music-fr-pere-la-victoire.mp3` | Ganne, "Le Père la Victoire" march | Louis Ganne; United States Marine Band (Edison 51311, 1923) | Public domain | [source](https://archive.org/details/edison-51311_01_9196) |
| `music-de-alte-kameraden.mp3` | Teike, "Alte Kameraden" march | Carl Teike; United States Marine Band (Edison 50895, 1921) | Public domain | [source](https://archive.org/details/78_old-comrades-march_united-states-marine-band-c-teike_gbia0023213b) |
| `music-it-aida.mp3` | Verdi, Triumphal March from "Aida" | Giuseppe Verdi; Sodero's Band (Edison 80371, 1917) | Public domain | [source](https://archive.org/details/edison-80371_01_5321) |
| `music-es-sevilla.mp3` | Albéniz, "Sevilla" (Suite española) | Isaac Albéniz; Banda Municipal de Madrid conducted by Ricardo Villa (Odeon, 1922) | Public domain | [source](https://archive.org/details/78_sevilla_banda-municipal-de-madrid-albeniz-mtro-ricardo-villa_gbia0038713b) |
| `music-pl-polonaise.mp3` | Chopin, Polonaise in A major, Op. 40 No. 1 "Military" | Frédéric Chopin; United States Marine Band (Edison 50922, 1922) | Public domain | [source](https://archive.org/details/78_polonaise-militaire_united-states-marine-band-chopin_gbia0276598a) |
| `music-granada.mp3` | Albéniz, "Granada" (Suite española) | Isaac Albéniz; Banda Municipal de Madrid conducted by Ricardo Villa (Odeon, 1922) | Public domain | [source](https://archive.org/details/78_granada_banda-municipal-de-madrid-albeniz-mtro-ricardo-villa_gbia0038713a) |
<!-- audio:end -->

## Code dependencies

Runtime: React (MIT), d3-geo, d3-zoom, d3-selection, d3-transition (ISC), topojson-client (ISC).
Build and test: Vite, Vitest, TypeScript, mapshaper, Playwright.

## Fonts

**Barlow** and **Barlow Condensed** by Jeremy Tribby, licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org/), bundled through the `@fontsource/barlow` and
`@fontsource/barlow-condensed` packages (latin subset only).

## Artwork

All icons, unit silhouettes and the advisor portrait are original inline SVG. National flags are simplified
drawings of the public national flags of the nations and neutral states in the scenario. The map's relief texture is
generated procedurally in the browser from each province's terrain type; it is not elevation data. The 3D city
models on the map are built in code from simple solids and drawn as SVG by a small renderer in `src/ui/art/iso3d.ts`;
no generated or downloaded 3D assets are used.
