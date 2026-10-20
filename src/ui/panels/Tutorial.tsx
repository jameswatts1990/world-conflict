import { useState } from 'react';
import { VICTORY } from '../../sim/config/rules';
import { vpToWin, type World } from '../../sim';

export function tutorialSteps(world: World, nationName: string) {
  return [
    {
      title: `You lead ${nationName}`,
      body: `It is an alternate history: six powers hold today's borders but fight with 1914 technology. Win by holding ${vpToWin(world)} of ${world.totalVp} objective victory points (★) for ${VICTORY.holdSeconds} seconds, or by having the best score when the 2½-hour campaign ends. The game is paused — take your time.`,
    },
    {
      title: 'The map',
      body: 'Drag to pan, scroll to zoom. Coloured regions belong to the six powers; hatched beige regions are neutral states you may invade. Grey hatched land is outside this prototype. Thin lines are movement connections: dashed brown = mountain passes, dotted blue = sea crossings.',
    },
    {
      title: 'Economy',
      body: 'The top bar shows money, materials, fuel and manpower with their change per minute. Click one of your provinces to construct buildings: Industrial Works raise output; Barracks, Arms Works and Tank Works enable recruiting infantry, artillery and tanks there. Occupied provinces produce half.',
    },
    {
      title: 'Armies',
      body: 'Click an army counter to select it, then right-click a province (or press Move and click) to march. Armies stop to fight enemies and to capture hostile or neutral provinces. Infantry defends well, artillery breaks defences, tanks dominate open ground but need fuel and struggle in mountains, forests and cities.',
    },
    {
      title: 'War, supply and research',
      body: 'Everyone starts at peace: declare war from Diplomacy. Armies must stay connected through your territory to your capital or a Supply Depot (or stand next to it) or they lose effectiveness and then strength. Research unlocks Interwar improvements and WWII unit upgrades.',
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
  ['R / D / L', 'Research / Diplomacy / toggle event log'],
  ['Esc', 'Cancel move mode, close dialogs, clear selection'],
];
