// Web Audio playback: effects, the distant-battle loop and music, each with its own volume.
// Browsers only allow sound once the player has interacted with the page, so the audio
// context is created on the first pointer or key press. Effects asked for before then are
// skipped; music waits and starts then. Every failure (no audio device, a file that will not
// load) degrades to silence: sound must never break the game.
import type { NationId } from '../sim';
import { CUES, type CueId } from './cues';

export interface AudioSettings {
  master: number;
  effects: number;
  music: number;
  muted: boolean;
}

export interface MusicTrack {
  url: string;
  title: string;
  /** Played more often for these nations' players. */
  nations?: NationId[];
  /** The main menu theme. */
  menu?: boolean;
}

export interface AudioLibrary {
  cues: Partial<Record<CueId, string[]>>;
  /** Seamless loop of distant fighting, under the effects volume. */
  battleLoop?: string;
  music: MusicTrack[];
}

export type MusicScene = { kind: 'menu' } | { kind: 'campaign'; nation: NationId } | { kind: 'silent' };

const SETTINGS_KEY = 'world-conflict:audio';
const DEFAULTS: AudioSettings = { master: 0.8, effects: 0.8, music: 0.5, muted: false };
const MAX_VOICES = 8;
/** How far the music dips under a bugle call or fanfare, and how it comes back. */
const DUCK_LEVEL = 0.3;
const DUCK_RELEASE_S = 1.5;
const MUSIC_FADE_S = 3;
/** Silence between campaign tracks, seconds: music comes and goes rather than wallpapering. */
const MUSIC_GAP_S: [number, number] = [20, 60];
/** Played more often: the player's own nation, then the shared pieces. */
const WEIGHT_OWN = 3;
const WEIGHT_SHARED = 2;

function loadSettings(): AudioSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return { ...DEFAULTS };
}

function saveSettings(s: AudioSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Best effort.
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface MusicVoice {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  track: MusicTrack;
  released?: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private effectsGain!: GainNode;
  private musicGain!: GainNode;
  private duckGain!: GainNode;
  private ambienceGain!: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private lastPlayed = new Map<CueId, number>();
  private lastVariant = new Map<CueId, number>();
  private voices = 0;
  private stingerUntil = 0;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceLevel = 0;
  private ambienceStop: ReturnType<typeof setTimeout> | null = null;
  private scene: MusicScene = { kind: 'menu' };
  private voice: MusicVoice | null = null;
  private lastTrack: MusicTrack | null = null;
  private nextTrackTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  settings: AudioSettings = loadSettings();

  constructor(private readonly library: AudioLibrary) {}

  /** Whether the browser has let the game start its audio (after the first interaction). */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Call from a user gesture. Creates the audio graph and starts any waiting music. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && document.visibilityState === 'visible') void this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.masterGain = ctx.createGain();
      this.effectsGain = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.duckGain = ctx.createGain();
      this.ambienceGain = ctx.createGain();
      this.ambienceGain.gain.value = 0;
      this.effectsGain.connect(this.masterGain);
      this.ambienceGain.connect(this.effectsGain);
      this.musicGain.connect(this.duckGain).connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
      this.ctx = ctx;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      this.applyVolumes();
      // Effects are small: decode them all now so the first click already has its sound.
      for (const urls of Object.values(this.library.cues)) for (const url of urls ?? []) void this.buffer(url);
      if (this.library.battleLoop) void this.buffer(this.library.battleLoop);
      this.startScene();
    } catch {
      this.ctx = null;
    }
  }

  /** Stop everything while the tab is hidden; carry on when it is back. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    if (hidden) {
      void this.ctx.suspend().catch(() => {});
      this.voice?.el.pause();
    } else {
      void this.ctx.resume().catch(() => {});
      if (this.voice) void this.voice.el.play().catch(() => {});
    }
  }

  // ---------------------------------------------------------------- Settings

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<AudioSettings>): void {
    const s = { ...this.settings, ...patch };
    this.settings = { master: clamp01(s.master), effects: clamp01(s.effects), music: clamp01(s.music), muted: s.muted };
    saveSettings(this.settings);
    this.applyVolumes();
    for (const l of this.listeners) l();
  }

  toggleMute(): void {
    this.update({ muted: !this.settings.muted });
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    this.masterGain.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.effectsGain.gain.setTargetAtTime(s.effects, t, 0.05);
    this.musicGain.gain.setTargetAtTime(s.music, t, 0.05);
  }

  // ---------------------------------------------------------------- Effects

  private buffer(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      const ctx = this.ctx!;
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  play(cue: CueId): void {
    const ctx = this.ctx;
    const urls = this.library.cues[cue];
    if (!ctx || ctx.state !== 'running' || this.settings.muted || !urls?.length) return;
    const spec = CUES[cue];
    const now = performance.now();
    if (now - (this.lastPlayed.get(cue) ?? -Infinity) < spec.cooldown) return;
    if (this.voices >= MAX_VOICES) return;
    if (spec.stinger && now < this.stingerUntil) return;
    this.lastPlayed.set(cue, now);
    // A different take from last time when there is more than one.
    let i = Math.floor(Math.random() * urls.length);
    if (urls.length > 1 && i === this.lastVariant.get(cue)) i = (i + 1) % urls.length;
    this.lastVariant.set(cue, i);
    const asked = now;
    void this.buffer(urls[i]).then((buf) => {
      // Not yet decoded on the first request: play it only if it is still timely (a click
      // must be instant; a bugle call may come a moment late).
      const timely = spec.stinger ? 2000 : 250;
      if (!buf || performance.now() - asked > timely || this.voices >= MAX_VOICES) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * spec.detune;
      const gain = ctx.createGain();
      gain.gain.value = spec.volume;
      src.connect(gain).connect(this.effectsGain);
      this.voices++;
      src.onended = () => {
        this.voices--;
        gain.disconnect();
      };
      src.start();
      if (spec.stinger) this.duck(buf.duration / src.playbackRate.value);
    });
  }

  /** Lower the music under a musical call so the two do not clash. */
  private duck(seconds: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.stingerUntil = performance.now() + seconds * 1000;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(DUCK_LEVEL, t + 0.15);
    g.setValueAtTime(DUCK_LEVEL, t + Math.max(0.15, seconds - 0.3));
    g.linearRampToValueAtTime(1, t + seconds + DUCK_RELEASE_S);
  }

  // ---------------------------------------------------------------- Battle ambience

  /** Distant fighting at 0–1 loudness; 0 fades it out. */
  setAmbience(level: number): void {
    const ctx = this.ctx;
    const url = this.library.battleLoop;
    if (!ctx || !url || Math.abs(level - this.ambienceLevel) < 0.01) return;
    this.ambienceLevel = level;
    this.ambienceGain.gain.setTargetAtTime(level, ctx.currentTime, level > 0 ? 1.2 : 0.8);
    if (level > 0) {
      if (this.ambienceStop) clearTimeout(this.ambienceStop);
      this.ambienceStop = null;
      if (!this.ambienceSource) void this.startAmbience(url);
    } else if (this.ambienceSource && !this.ambienceStop) {
      this.ambienceStop = setTimeout(() => {
        this.ambienceSource?.stop();
        this.ambienceSource = null;
        this.ambienceStop = null;
      }, 5000);
    }
  }

  private async startAmbience(url: string): Promise<void> {
    const buf = await this.buffer(url);
    if (!buf || this.ambienceSource || this.ambienceLevel === 0) return;
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // Skip the codec's padding at each end so the loop has no gap.
    src.loopStart = Math.min(0.05, buf.duration / 4);
    src.loopEnd = Math.max(src.loopStart + 0.1, buf.duration - 0.05);
    src.connect(this.ambienceGain);
    // Start somewhere in the loop, so it does not always open on the same shell.
    src.start(0, Math.random() * (src.loopEnd - src.loopStart) + src.loopStart);
    this.ambienceSource = src;
  }

  // ---------------------------------------------------------------- Music

  setMusic(scene: MusicScene): void {
    const same =
      scene.kind === this.scene.kind && (scene.kind !== 'campaign' || (this.scene.kind === 'campaign' && this.scene.nation === scene.nation));
    if (same) return;
    this.scene = scene;
    this.startScene();
  }

  private startScene(): void {
    if (!this.ctx) return;
    if (this.nextTrackTimer) clearTimeout(this.nextTrackTimer);
    this.nextTrackTimer = null;
    this.fadeOutMusic();
    const scene = this.scene;
    if (scene.kind === 'menu') {
      const theme = this.library.music.find((t) => t.menu);
      if (theme) this.playTrack(theme, true);
    } else if (scene.kind === 'campaign') {
      // A short pause first: the campaign opens on a bugle call.
      this.queueNextTrack(6);
    }
  }

  private queueNextTrack(delaySeconds: number): void {
    if (this.nextTrackTimer) clearTimeout(this.nextTrackTimer);
    this.nextTrackTimer = setTimeout(() => {
      this.nextTrackTimer = null;
      const scene = this.scene;
      if (scene.kind !== 'campaign') return;
      const track = this.pickTrack(scene.nation);
      if (track) this.playTrack(track, false);
    }, delaySeconds * 1000);
  }

  private pickTrack(nation: NationId): MusicTrack | null {
    const pool = this.library.music.filter((t) => !t.menu && t !== this.lastTrack);
    const candidates = pool.length ? pool : this.library.music.filter((t) => !t.menu);
    const weight = (t: MusicTrack) => (!t.nations?.length ? WEIGHT_SHARED : t.nations.includes(nation) ? WEIGHT_OWN : 1);
    let r = Math.random() * candidates.reduce((sum, t) => sum + weight(t), 0);
    for (const t of candidates) {
      r -= weight(t);
      if (r <= 0) return t;
    }
    return candidates.at(-1) ?? null;
  }

  private playTrack(track: MusicTrack, loop: boolean): void {
    const ctx = this.ctx!;
    const el = new Audio(track.url);
    el.preload = 'auto';
    el.loop = loop;
    let source: MediaElementAudioSourceNode;
    try {
      source = ctx.createMediaElementSource(el);
    } catch {
      return;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.musicGain);
    const voice: MusicVoice = { el, source, gain, track };
    this.voice = voice;
    this.lastTrack = track;
    el.addEventListener('ended', () => {
      if (this.voice !== voice) return;
      this.releaseVoice(voice);
      this.voice = null;
      const [lo, hi] = MUSIC_GAP_S;
      this.queueNextTrack(lo + Math.random() * (hi - lo));
    });
    el.addEventListener('error', () => {
      if (this.voice === voice) this.voice = null;
      this.releaseVoice(voice);
    });
    if (document.visibilityState === 'visible') void el.play().catch(() => {});
    gain.gain.setTargetAtTime(1, ctx.currentTime, MUSIC_FADE_S / 3);
  }

  private fadeOutMusic(): void {
    const voice = this.voice;
    if (!voice || !this.ctx) return;
    this.voice = null;
    voice.gain.gain.setTargetAtTime(0, this.ctx.currentTime, MUSIC_FADE_S / 4);
    setTimeout(() => this.releaseVoice(voice), MUSIC_FADE_S * 1000);
  }

  private releaseVoice(voice: MusicVoice): void {
    if (voice.released) return;
    voice.released = true;
    voice.el.pause();
    voice.el.removeAttribute('src');
    voice.el.load();
    voice.source.disconnect();
    voice.gain.disconnect();
  }
}
