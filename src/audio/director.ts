// Connects a running campaign to the audio engine: new game events become sound cues, the
// player's battles set the distant-fighting loop, and the music follows the campaign.
import type { Command, CommandResult, GameState, NationId, World } from '../sim';
import { battleIntensity, cuesForEvents, freshEvents } from './cues';
import type { AudioEngine } from './engine';

/** What the audio needs from a running campaign (the browser's GameController). */
export interface AudibleGame {
  readonly state: GameState;
  readonly world: World;
  readonly human: NationId;
  readonly loop: { readonly paused: boolean };
  subscribe(listener: () => void): () => void;
  onCommand(listener: (command: Command, result: CommandResult) => void): () => void;
}

/** Starts the campaign's sound; returns a function that stops it and goes back to the menu theme. */
export function attachGame(engine: AudioEngine, game: AudibleGame): () => void {
  let lastEventId = game.state.nextEventId - 1;
  let ended = game.state.outcome !== null;
  if (game.state.tick === 0) engine.play('campaign.start');
  engine.setMusic(ended ? { kind: 'silent' } : { kind: 'campaign', nation: game.human });

  const onUpdate = () => {
    const { state, world, human } = game;
    const fresh = freshEvents(state, human, lastEventId);
    if (fresh.length) {
      lastEventId = fresh[fresh.length - 1].id;
      for (const cue of cuesForEvents(fresh, state, world, human)) engine.play(cue);
    }
    // The fighting falls silent while paused.
    engine.setAmbience(game.loop.paused || state.outcome ? 0 : battleIntensity(state, human));
    if (state.outcome && !ended) {
      ended = true;
      engine.setMusic({ kind: 'silent' });
    }
  };

  const onCommand = (command: Command, result: CommandResult) => {
    if (!result.ok) engine.play('ui.error');
    else if (command.type === 'move') engine.play('army.order');
  };

  // Army counters on the map are SVG groups, not buttons: your own answer, others click softly.
  const onClick = (e: MouseEvent) => {
    const id = (e.target as Element | null)?.closest?.('g[data-army]')?.getAttribute('data-army');
    const army = id ? game.state.armies[id] : undefined;
    if (army) engine.play(army.owner === game.human ? 'army.select' : 'ui.tab');
  };

  const unsubscribe = game.subscribe(onUpdate);
  const unCommand = game.onCommand(onCommand);
  document.addEventListener('click', onClick, true);
  return () => {
    unsubscribe();
    unCommand();
    document.removeEventListener('click', onClick, true);
    engine.setAmbience(0);
    engine.setMusic({ kind: 'menu' });
  };
}
