import { useState } from 'react';
import { VICTORY } from '../../sim/config/rules';
import { vpToWin, type World } from '../../sim';
import { hoursText, proseDuration } from '../format';
import { AdvisorPortrait, Icon, type IconName } from '../icons';
import { useEscape } from './Common';

export function tutorialSteps(world: World, nationName: string, limitMinutes: number): { title: string; icon: IconName; body: string }[] {
  return [
    {
      title: `You lead ${nationName}`,
      icon: 'flag',
      body: `An alternate history: six powers hold today's borders but fight with 1914 technology. Win by holding ${vpToWin(world)} of ${world.totalVp} objective victory points (★) for ${proseDuration(VICTORY.holdSeconds)}, or by leading on score when the ${hoursText(limitMinutes)} campaign ends. The game is paused — take your time.`,
    },
    {
      title: 'The map',
      icon: 'diplomacy',
      body: 'Drag to pan, scroll to zoom, or use the overview map at the bottom right. Tinted land belongs to the six powers; hatched beige regions are neutral states you may invade. Dark grey land lies outside this campaign. Switch between Political, Terrain and Supply views at the top left, and press K for the map key.',
    },
    {
      title: 'Economy',
      icon: 'factory',
      body: 'The top bar shows money, materials, fuel and manpower with their change per minute; point at one for the breakdown. Click one of your provinces to open it on the right: Barracks, Arms Works and Tank Works let you mobilise infantry, artillery and tanks there, and Industrial Works raise output. Occupied provinces produce half.',
    },
    {
      title: 'Armies',
      icon: 'swords',
      body: 'Click an army counter to select it, then right-click a province or an enemy army to march there (or press Move, then click). The route and arrival time show as you point. Armies stop to fight and to capture hostile or neutral provinces on the way. Infantry holds ground, artillery breaks defences, tanks rule open ground but burn fuel.',
    },
    {
      title: 'War, supply and research',
      icon: 'research',
      body: 'Everyone starts at peace: declare war from Diplomacy on the left command rail. Armies must stay connected through your territory to your capital or a Supply Depot, or they fight worse and then lose strength. Research unlocks Interwar improvements and WWII unit upgrades.',
    },
    {
      title: 'Time & saving',
      icon: 'clock',
      body: 'Space pauses. 1x is the real campaign pace; the orange DEV speeds are for testing only. Save to a browser slot at any time: the campaign is paused while closed and resumes exactly where you left it. Press H for the controls and to replay this briefing.',
    },
  ];
}

export function Tutorial({ world, nationName, limitMinutes, onClose }: { world: World; nationName: string; limitMinutes: number; onClose: () => void }) {
  useEscape(onClose);
  const steps = tutorialSteps(world, nationName, limitMinutes);
  const [i, setI] = useState(0);
  const step = steps[i];
  return (
    <div className="tutorial-backdrop">
      <div className="tutorial" role="dialog" aria-label="Briefing" data-testid="tutorial">
        <div className="tutorial-side">
          <AdvisorPortrait size={76} />
          <div className="advisor-name">Chief of Staff</div>
          <div className="advisor-role">Briefing</div>
        </div>
        <div className="tutorial-main">
          <div className="tutorial-step">
            <Icon name={step.icon} size={14} /> Briefing {i + 1} of {steps.length}
          </div>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
          <div className="tutorial-foot">
            <span className="step-dots" aria-hidden>
              {steps.map((_, n) => (
                <span key={n} className={n === i ? 'on' : n < i ? 'past' : ''} />
              ))}
            </span>
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
      </div>
    </div>
  );
}

export const CONTROLS: [string, string][] = [
  ['Left-click province', 'Select it: output, buildings, recruitment, forces present'],
  ['Left-click army counter', 'Select an army (Shift-click adds more of your armies)'],
  ['Right-click', 'March the selected armies to the province or enemy army under the cursor'],
  ['M / Move button', 'Move mode: the next left-click sets the destination'],
  ['S', 'Stop the selected armies after their current leg'],
  ['Drag / Mouse wheel', 'Pan / zoom the map (or use the overview map)'],
  ['Space', 'Pause / resume'],
  ['1 – 6', 'Speed 1x, 2x, then DEV 5x / 20x / 60x / 200x (testing only)'],
  ['R / D / L', 'Research / Diplomacy / field reports'],
  ['K', 'Map key'],
  ['H / ?', 'These controls'],
  ['Esc', 'Close the open window, cancel move mode, then clear the selection'],
];
