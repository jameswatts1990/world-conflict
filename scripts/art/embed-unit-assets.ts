// Standalone HTML sheets must display imported art without a running Vite server.
import { readFileSync } from 'node:fs';
import { UNIT_ASSET_FILES } from '../../src/ui/art/UnitAssets';

const embedded = new Map<string, string>();

export function embeddedUnitAsset(href: string): string {
  const file = UNIT_ASSET_FILES.get(href);
  if (!file) throw new Error(`Unknown unit image: ${href}`);
  let url = embedded.get(href);
  if (!url) {
    const png = readFileSync(new URL(`../../src/assets/units/${file}`, import.meta.url));
    url = `data:image/png;base64,${png.toString('base64')}`;
    embedded.set(href, url);
  }
  return url;
}

export function embedUnitAssetImages(markup: string): string {
  return markup.replace(/href="([^"]+)"/g, (attribute, href: string) =>
    UNIT_ASSET_FILES.has(href) ? `href="${embeddedUnitAsset(href)}"` : attribute,
  );
}
