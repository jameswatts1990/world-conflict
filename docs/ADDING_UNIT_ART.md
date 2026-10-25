# Adding or replacing unit artwork

The browser uses portraits and sixteen directional PNGs, not live GLBs. Each of the thirteen unit types currently
uses one imported model across eras and nations. Stats, research, names, flags and ownership colours remain independent
of this artwork. A pack mule accompanies mountain troops; it is not a new gameplay unit.

## Import a model

1. Export a GLB with embedded textures and put it in `scripts/art/sources/<asset-id>/model.glb`. Keep any supplied
   provenance with it. Record the original filename and SHA-256 in `scripts/art/sources/imported-units.json`.
2. Add an entry to `scripts/art/unit-assets.json`. Each part has a `source` folder and either a target `height`
   (people/animals) or `length` (largest ground dimension). Optional `at: [forward, across]` places a part in a
   formation; `yaw` corrects a source's facing in degrees. The default source front is -Y, with Z up in Blender.
   Repeating a source makes a squad; different sources can share a formation, as with the mountain troops/mule.
3. Render and inspect a first view with Blender 4.3+:

   ```bash
   blender --background --threads 4 --python scripts/art/render-unit-assets.py -- --assets light-tanks --headings 0
   ```

4. Check facing, placement and size, then render the remaining directions:

   ```bash
   blender --background --threads 4 --python scripts/art/render-unit-assets.py -- --assets light-tanks --headings 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 --no-portrait
   ```

   With no arguments the script rebuilds all twelve newer unit sets. It derives one frame and ground anchor
   across all sixteen directions, so an army does not jump as it turns. Commit every generated PNG and
   `src/assets/units/frames.json` together. After changing a recipe, regenerate all its headings and portrait.
   The original line infantry images use `scripts/art/render-infantry.py`; its frame is retained in `frames.json`.
5. Map the asset in `src/ui/art/UnitAssets.ts`. `default` applies to every era; `generations` overrides only the
   listed eras. For example, after importing and rendering a new `battle-tanks-1940` asset:

   ```ts
   tank: { default: 'battle-tanks', generations: { ww2: 'battle-tanks-1940' } },
   ```

The same mapping supplies map sprites and all card/icon variants. Images are shared across nations; full cards
keep their national insignia and map armies keep their flag badges and selection/ownership rings. PNGs pass
through `spriteHref` unchanged because they are already bitmaps. Unmapped types use the procedural artwork;
the troopship retains its procedural model. New gameplay unit types also require simulation/UI registration:
adding an asset does not create a recruitable unit or change its rules.

## Validate

Run `npm run typecheck`, `npm test`, `npm run build`, `npm run build:e2e`, `npm run e2e` and `npm run e2e:mobile`.
In the cloud environment use `CHROMIUM_PATH=/usr/bin/chromium` for the browser scripts. The asset tests check the
shipped files, all directions/eras, stable anchors and generation overrides. Inspect the actual
game at map and close zoom, including recruitment and unit details, on desktop and touch screens.

The contact sheets embed PNGs for offline viewing:

```bash
npx vite-node scripts/art/contact-sheet.tsx /tmp/unit-art/cards.html --nations uk --bg dark
npx vite-node scripts/art/unit-models-sheet.tsx /tmp/unit-art/models.html
```

Normal installs and builds use committed images and do not require Blender or access to the source GLBs.
