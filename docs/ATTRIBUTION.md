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

Every sound effect is **CC0** (public domain dedication) or a **public domain** work; every music track is a
**public domain** recording of a public domain composition: recorded and published in 1925 or earlier (public
domain in the United States since 2026 and long expired in the UK and EU) of a work whose composers all died before
1956, or an official recording by a United States federal government band. The reasoning for each track is recorded
next to it in `scripts/audio/sources.mjs`.

### How the bundled files were produced

1. `npm run audio:fetch` downloads every source listed in `scripts/audio/sources.mjs` into `data-src/audio/`
   (git-ignored).
2. `npm run audio:build` (`scripts/audio/build.mjs`, using [FFmpeg](https://ffmpeg.org/) as a build-time tool)
   trims each recording, levels it (effects to a -1 dBFS peak, music to -20 LUFS), cross-fades the battle loop so it
   repeats without a seam, encodes MP3 into `src/audio/files/` and rewrites the table below.

<!-- audio:start -->
| File | What | By | Licence | |
| --- | --- | --- | --- | --- |
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
