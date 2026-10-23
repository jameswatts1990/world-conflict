import { useEffect, useMemo, useState } from 'react';
import { EUROPE_SCENARIO, buildWorld, createInitialState, hashState, joinNewcomers, type AiDifficulty, type GameSettings, type GameState, type NationId } from '../sim';
import { GameController } from './game/GameController';
import { GameScreen } from './GameScreen';
import { MainMenu } from './MainMenu';

export function App() {
  const world = useMemo(() => buildWorld(EUROPE_SCENARIO), []);
  const [session, setSession] = useState<{ ctrl: GameController; tutorial: boolean; key: number } | null>(null);

  useEffect(() => {
    if (!session) return;
    session.ctrl.start();
    return () => session.ctrl.dispose();
  }, [session]);

  // Expose a debug handle for automated browser checks (scripts/e2e) and tinkering.
  useEffect(() => {
    const w = window as unknown as { __game?: unknown; __hash?: () => string | null };
    w.__game = session?.ctrl ?? null;
    w.__hash = () => (session ? hashState(session.ctrl.state) : null);
  }, [session]);

  const startNew = (nation: NationId, seed: number, speed: GameSettings['speed'], difficulty: AiDifficulty) => {
    const state = createInitialState(world, { seed, humanNation: nation, speed, difficulty });
    setSession({ ctrl: new GameController(world, state), tutorial: true, key: Date.now() });
  };

  const load = (state: GameState) => {
    // Countries added to the scenario since the save was made join it now.
    joinNewcomers(state, world);
    const ctrl = new GameController(world, state);
    setSession({ ctrl, tutorial: false, key: Date.now() });
  };

  if (!session) return <MainMenu world={world} onStart={startNew} onLoad={load} />;
  return (
    <GameScreen
      key={session.key}
      ctrl={session.ctrl}
      showTutorial={session.tutorial}
      onLoad={load}
      onExit={() => {
        session.ctrl.autosave();
        setSession(null);
      }}
    />
  );
}
