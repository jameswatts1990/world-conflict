import { useState } from 'react';
import { VICTORY } from '../../sim/config/rules';
import { vpToWin, type World } from '../../sim';

export function tutorialSteps(world: World, nationName: string) {
  return [
    {
      title: `You lead ${nationName}`,
      body: `It is an alternate history: six powers hold today's borders but fight with 1914 technology. Win by holding ${vpToWin(world)} of ${world.totalVp} objective victory points (★) for ${VICTORY.holdSeconds} seconds, or by having the best score when the 2½-hour campaign ends. Every nation has its own named equipment and one national speciality. The game is paused — take your time.`,
    },
    {
      title: 'The map',
      body: 'Drag to pan, scroll to zoom; towns appear as you zoom in. Coloured regions belong to the six powers; hatched beige regions are neutral states you may invade. Thin lines are movement connections: dashed brown = mountain passes, dotted blue = sea crossings. The buttons in the legend (or V) switch to morale, city-size and supply views.',
    },
    {
      title: 'Cities and the economy',
      body: 'Click one of your provinces to open its city. Each city has building slots set by its size, so choose what to build: industry and exchanges for money and materials, housing to grow the city into a bigger tier with more slots, universities for research, barracks, arms and tank works to recruit, and infrastructure (forts, depots, railways) that needs no slot.',
    },
    {
      title: 'Morale',
      body: 'Civilian morale (0–100) drives each province\'s output: war, enemies at the border, battles and a lost capital lower it; garrisons, propaganda, housing and time raise it. Conquered provinces start resentful. Your national morale, shown in the top bar, caps how high your soldiers\' spirits can climb.',
    },
    {
      title: 'Armies',
      body: 'Click an army counter to select it, then right-click a province (or press Move and click) to march. Battles wear down strength and morale: a broken army routs to a friendly neighbour, and one with nowhere to run surrenders — encircle the enemy. Infantry holds, artillery breaks lines from the second rank, tanks smash through open ground, anti-tank guns stop them, mountain troops own the passes. Veterans fight better.',
    },
    {
      title: 'War, supply and research',
      body: 'Everyone starts at peace: declare war from Diplomacy. Armies must stay connected to your capital or a Supply Depot (or stand next to it). Research (R) is a tree across four eras: it unlocks new units and buildings and upgrades your equipment in place. It is longer than a campaign, so choose a direction; click a distant technology to queue the whole path.',
    },
    {
      title: 'Time & saving',
      body: 'Space pauses. 1x is the real campaign pace; orange DEV speeds are for testing only. Save to browser slots any time — the game is paused while closed and resumes exactly where you saved. Press ? for this guide and the controls.',
    },
  ];
}

export function Tutorial({ world, nationName, onClose }: { world: World; nationName: string; onClose: () => void }) {
  const steps = tutorialSteps(world, nationName);
  const [i, setI] = useState(0);
  const step = steps[i];
  return (
    <div className="tutorial" role="dialog" aria-label="Tutorial" data-testid="tutorial">
      <div className="tutorial-step">
        Step {i + 1} / {steps.length}
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      <div className="btn-row">
        <button onClick={onClose} className="ghost">
          Skip
        </button>
        {i > 0 && <button onClick={() => setI(i - 1)}>Back</button>}
        {i < steps.length - 1 ? (
          <button className="primary" onClick={() => setI(i + 1)}>
            Next
          </button>
        ) : (
          <button className="primary" onClick={onClose} data-testid="tutorial-done">
            Start playing
          </button>
        )}
      </div>
    </div>
  );
}

export const CONTROLS: [string, string][] = [
  ['Left-click province', 'Select province (buildings, recruitment, armies there)'],
  ['Left-click army counter', 'Select army (Shift-click: add to selection)'],
  ['Right-click province', 'Move selected army there'],
  ['M / Move button', 'Move mode: next left-click sets the destination'],
  ['S', 'Stop selected army after its current leg'],
  ['Drag / mouse wheel', 'Pan / zoom the map'],
  ['Space', 'Pause / resume'],
  ['1 – 6', 'Speed 1x, 2x, then DEV 5x / 20x / 60x / 200x (testing only)'],
  ['R / D / L', 'Research tree / Diplomacy / toggle event log'],
  ['V', 'Cycle map view: political, morale, city size, supply'],
  ['Esc', 'Cancel move mode, close dialogs, clear selection'],
];
