# Data sources and attribution

## Map geometry

Made with **Natural Earth**. Free vector and raster map data @ [naturalearthdata.com](https://www.naturalearthdata.com/).

- `ne_10m_admin_1_states_provinces` (v5.1.2): province shapes, built by merging admin-1 units into game provinces
- `ne_50m_admin_0_countries` (v5.1.2): world context outside the playable theatre

Natural Earth data is in the **public domain**
([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)). The source repository is
[nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector), tag `v5.1.2`.

### How the bundled files were produced

1. `npm run map:fetch` downloads the GeoJSON files listed above into `data-src/` (git-ignored).
2. `npm run map:build` (`scripts/map/build-map.mjs`, using [mapshaper](https://github.com/mbloch/mapshaper),
   MPL-2.0, as a build-time tool only):
   - assigns each admin-1 unit to a game province using `scripts/map/province-sources.mjs`
   - dissolves units into provinces, drops islets under 120 km², simplifies to 7% of vertices, cleans topology
   - writes `src/assets/map/theatre.topo.json` (50 provinces) and `src/assets/map/world.topo.json`
     (countries, Antarctica removed, simplified to 12%)

Shapes are simplified for a strategy map. Borders are modern borders as published by Natural Earth. Province
groupings, names and all gameplay data are original to this project.

The bundled files contain only geometry and ids. Province adjacency is defined separately, by hand, in
`src/sim/scenario/europe/connections.ts`.

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
generated procedurally in the browser from each province's terrain type; it is not elevation data.
