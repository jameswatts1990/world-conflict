// Config overrides for balance runs, written PATH=VALUE. PATH starts with the name of an
// export of src/sim/config (AI, UNITS, POWERS, VICTORY …) and VALUE is JSON, or a bare word
// for a string:
//   AI.warStrengthRatio=1.3   AI_LEVELS.easy.attackRatio=1.5   UNITS.tank.cost.money=280   AI.personality.doctrines=["infantry","armour"]
// Paths must already exist and values keep their type, so a typo fails the run instead of
// quietly changing nothing.

export interface Override {
  path: string;
  value: unknown;
}

export function parseOverride(text: string): Override {
  const eq = text.indexOf('=');
  if (eq <= 0) throw new Error(`Override "${text}" should look like PATH=VALUE, e.g. AI.warStrengthRatio=1.3`);
  const path = text.slice(0, eq).trim();
  const raw = text.slice(eq + 1).trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  return { path, value };
}

function kind(v: unknown): string {
  return Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
}

/** Sets each override in place on the loaded config exports (a map from export name to value). */
export function applyOverrides(config: Record<string, unknown>, overrides: readonly Override[]): void {
  for (const { path, value } of overrides) {
    const keys = path.split('.');
    if (keys.length < 2 || !(keys[0] in config)) {
      const known = Object.keys(config)
        .filter((k) => /^[A-Z][A-Z_]*$/.test(k) && typeof config[k] === 'object')
        .join(', ');
      throw new Error(`Unknown config path ${path}: it should start with one of ${known}`);
    }
    let target = config as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      const next = target[keys[i]];
      if (next === null || typeof next !== 'object') throw new Error(`Unknown config path ${path}: ${keys.slice(0, i + 1).join('.')} has no fields`);
      target = next as Record<string, unknown>;
    }
    const last = keys[keys.length - 1];
    if (!Object.prototype.hasOwnProperty.call(target, last)) throw new Error(`Unknown config path ${path}`);
    const before = target[last];
    if (kind(before) !== kind(value)) throw new Error(`${path} is ${kind(before)} ${JSON.stringify(before)}; it cannot be set to ${JSON.stringify(value)}`);
    target[last] = value;
  }
}

/** How a list of overrides reads in reports. */
export function describeOverrides(overrides: readonly Override[]): string {
  return overrides.length === 0 ? 'none' : overrides.map((o) => `${o.path}=${JSON.stringify(o.value)}`).join(', ');
}
