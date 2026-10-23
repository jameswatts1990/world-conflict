// Sound window: mute, the three volumes, and the music playing now.
import { useSyncExternalStore } from 'react';
import { audio, type AudioSettings } from '../../audio';
import { Icon } from '../icons';
import { Modal } from './Common';

/** Re-renders when the sound settings or the music change. */
export function useSound(): typeof audio {
  useSyncExternalStore(audio.subscribe, () => audio.version);
  return audio;
}

const VOLUMES: [keyof Omit<AudioSettings, 'muted'>, string][] = [
  ['master', 'Overall'],
  ['music', 'Music'],
  ['effects', 'Effects'],
];

export function SoundDialog({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  const sound = useSound();
  const s = sound.settings;
  const track = sound.nowPlaying;
  return (
    <Modal title="Sound" icon={s.muted ? 'muted' : 'sound'} subtitle="Music and effects" size="narrow" onClose={onClose}>
      <div className="sound-panel">
        <label className="sound-switch">
          <input type="checkbox" id="sound-on" checked={!s.muted} onChange={(e) => sound.update({ muted: !e.target.checked })} data-testid="sound-on" />
          <span>Sound on</span>
          {!touch && <span className="muted">N mutes or unmutes at any time</span>}
        </label>
        {VOLUMES.map(([key, label]) => (
          <label key={key} className={`sound-row${s.muted ? ' off' : ''}`} htmlFor={`volume-${key}`}>
            <span>{label}</span>
            <input
              type="range"
              id={`volume-${key}`}
              min={0}
              max={100}
              step={5}
              value={Math.round(s[key] * 100)}
              onChange={(e) => sound.update({ [key]: Number(e.target.value) / 100 })}
              // Letting go of the effects slider plays a click at the new level.
              onPointerUp={key === 'effects' ? () => sound.play('ui.click') : undefined}
              data-testid={`volume-${key}`}
            />
            <span className="sound-value">{Math.round(s[key] * 100)}%</span>
          </label>
        ))}
        <div className="now-playing">
          <Icon name="sound" size={16} />
          <div className="np-text">
            <span className="np-label">Now playing</span>
            <span>{track ? track.title : sound.unlocked ? 'A pause between pieces' : 'Music starts at your first click'}</span>
          </div>
          {track && !track.menu && (
            <button onClick={() => sound.skipTrack()} title="Play another piece" data-testid="skip-track">
              <Icon name="skip" size={15} /> Next
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
