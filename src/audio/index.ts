// Sound for World Conflict: one engine for the page, and the hooks that feed it. Interface
// sounds come from page-wide listeners (buttons, tabs, dialogs), so components need no audio
// code; a `data-sound` attribute on an element overrides its cue ("none" silences it).
import { AUDIO_LIBRARY } from './assets';
import { CUES, type CueId } from './cues';
import { attachGame, type AudibleGame } from './director';
import { AudioEngine } from './engine';

export type { AudioSettings } from './engine';
export type { AudibleGame } from './director';

export const audio = new AudioEngine(AUDIO_LIBRARY);

/** Sound for a running campaign; returns the function that stops it. */
export function attachGameAudio(game: AudibleGame): () => void {
  return attachGame(audio, game);
}

const CLICKABLE = 'button, [role="button"], [role="tab"], a[href], select, input[type="checkbox"]';

function onClick(e: MouseEvent): void {
  const el = (e.target as Element | null)?.closest?.(CLICKABLE);
  if (!el || (el as HTMLButtonElement).disabled) return;
  const custom = el.closest('[data-sound]')?.getAttribute('data-sound');
  if (custom === 'none') return;
  if (custom && custom in CUES) return audio.play(custom as CueId);
  audio.play(el.matches('[role="tab"], [data-tab], input[type="checkbox"]') ? 'ui.tab' : 'ui.click');
}

function onDialogs(records: MutationRecord[]): void {
  for (const r of records) {
    for (const n of r.addedNodes) {
      if (n instanceof Element && (n.matches('[role="dialog"]') || n.querySelector('[role="dialog"]'))) {
        audio.play('ui.open');
        return;
      }
    }
  }
}

/** N mutes and unmutes everything (a volume control joins the interface later). */
function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.key.toLowerCase() !== 'n') return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  audio.toggleMute();
  if (!audio.settings.muted) audio.play('ui.click');
}

let installed = false;

/** Page-wide hooks: unlock on the first interaction, interface sounds, the mute key, hidden tabs. */
export function installAudio(): void {
  if (installed) return;
  installed = true;
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('keydown', onKey);
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', () => audio.setHidden(document.visibilityState === 'hidden'));
  new MutationObserver(onDialogs).observe(document.body, { childList: true, subtree: true });
}
