// Bridges the framework-free simulation to the browser: owns the Simulation,
// drives the fixed-timestep GameLoop from requestAnimationFrame, and notifies
// React subscribers. Pause, speed and autosave live here — they are client
// concerns, not simulation rules.
import { attachGameAudio } from '../../audio';
import { CLIENT_SPEEDS } from '../../sim/config/timing';
import { GameLoop, Simulation, detectedProvinces, radarBlips, visibleProvinces, type Blip, type Command, type CommandResult, type GameState, type NationId, type ProvinceId, type World } from '../../sim';
import { saveToSlot } from './storage';

const UI_NOTIFY_MS = 120;
const AUTOSAVE_MS = 120_000;
/** Longest real-time gap a single frame may cover (prevents catch-up after stalls). */
const MAX_FRAME_MS = 250;

type Listener = () => void;
type CommandListener = (command: Command, result: CommandResult) => void;

export class GameController {
  readonly sim: Simulation;
  readonly loop: GameLoop;
  readonly human: NationId;
  version = 0;
  lastError: string | null = null;

  private listeners = new Set<Listener>();
  private frameListeners = new Set<Listener>();
  private commandListeners = new Set<CommandListener>();
  private detachAudio: (() => void) | null = null;
  private raf = 0;
  private lastFrame = 0;
  private lastNotify = 0;
  private dirty = false;
  private lastAutosave = 0;
  private running = false;
  private sightCache: { state: GameState; tick: number; version: number; seen: ReadonlySet<ProvinceId> } | null = null;
  private radarCache: { state: GameState; tick: number; version: number; blips: readonly Blip[]; at: ReadonlyMap<ProvinceId, Blip> } | null = null;

  constructor(
    readonly world: World,
    state: GameState,
  ) {
    this.sim = new Simulation(world, state);
    this.human = state.settings.humanNation!;
    this.loop = new GameLoop(() => {
      this.sim.step();
      return !this.sim.state.outcome;
    });
  }

  get state(): GameState {
    return this.sim.state;
  }

  /** Provinces the player can see through the fog of war, worked out once per tick (orders can change it too). */
  sight(): ReadonlySet<ProvinceId> {
    const c = this.sightCache;
    if (c && c.state === this.state && c.tick === this.state.tick && c.version === this.version) return c.seen;
    const seen = visibleProvinces(this.state, this.world, this.human);
    this.sightCache = { state: this.state, tick: this.state.tick, version: this.version, seen };
    return seen;
  }

  /** The radar blips the player picks up beyond their sight (unknown armies, rough size only), worked out once per tick. */
  radar(): { blips: readonly Blip[]; at: ReadonlyMap<ProvinceId, Blip> } {
    const c = this.radarCache;
    if (c && c.state === this.state && c.tick === this.state.tick && c.version === this.version) return c;
    const blips = radarBlips(this.state, this.world, this.human, this.sight(), detectedProvinces(this.state, this.world, this.human));
    const at = new Map(blips.map((b) => [b.province, b]));
    this.radarCache = { state: this.state, tick: this.state.tick, version: this.version, blips, at };
    return this.radarCache;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.lastAutosave = this.lastFrame;
    this.raf = requestAnimationFrame(this.frame);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.detachAudio = attachGameAudio(this);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.detachAudio?.();
    this.detachAudio = null;
    this.listeners.clear();
    this.frameListeners.clear();
    this.commandListeners.clear();
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(MAX_FRAME_MS, now - this.lastFrame);
    this.lastFrame = now;
    const ticks = this.loop.advance(dt);
    if (ticks > 0) this.dirty = true;
    for (const l of this.frameListeners) l();
    if (this.dirty && now - this.lastNotify >= UI_NOTIFY_MS) this.notify();
    if (!this.loop.paused && now - this.lastAutosave >= AUTOSAVE_MS) {
      this.autosave();
      this.lastAutosave = now;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** The local prototype never runs in the background: hide the tab, the game pauses. */
  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      if (!this.loop.paused && !this.state.outcome) this.autosave();
      this.setPaused(true);
    }
  };

  notify(): void {
    this.version++;
    this.dirty = false;
    this.lastNotify = performance.now();
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  subscribeFrame = (l: Listener): (() => void) => {
    this.frameListeners.add(l);
    return () => this.frameListeners.delete(l);
  };

  getVersion = (): number => this.version;

  /** Hears every command the player submits and its result (sound uses it). */
  onCommand = (l: CommandListener): (() => void) => {
    this.commandListeners.add(l);
    return () => this.commandListeners.delete(l);
  };

  submit(command: Command): CommandResult {
    const result = this.sim.submit(command);
    this.lastError = result.ok ? null : result.reason;
    for (const l of this.commandListeners) l(command, result);
    this.notify();
    return result;
  }

  setPaused(paused: boolean): void {
    if (this.state.outcome && !paused) return;
    this.loop.paused = paused;
    this.loop.reset();
    this.notify();
  }

  togglePause(): void {
    this.setPaused(!this.loop.paused);
  }

  setSpeed(multiplier: number): void {
    if (!CLIENT_SPEEDS.some((s) => s.multiplier === multiplier)) return;
    this.loop.speed = multiplier;
    this.notify();
  }

  autosave(): void {
    try {
      saveToSlot('autosave', this.state, `${this.world.nations[this.human].name} (autosave)`);
    } catch {
      // Storage full or unavailable: autosave is best-effort.
    }
  }
}
