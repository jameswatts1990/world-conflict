import { useState } from 'react';
import { VICTORY } from '../../sim/config/rules';
import { vpToWin, type World } from '../../sim';
import { hoursText, proseDuration } from '../format';
import { AdvisorPortrait, Icon, type IconName } from '../icons';
import { useEscape } from './Common';

/** How the player is playing: touch input and the compact (phone) layouts change some instructions. */
export interface BriefingInput {
  touch: boolean;
  compact: boolean;
}

export function tutorialSteps(
  world: World,
  nationName: string,
  limitMinutes: number,
  { touch, compact }: BriefingInput = { touch: false, compact: false },
): { title: string; icon: IconName; body: string }[] {
  // Save, load and help sit behind More in the compact layouts.
  const saveWhere = compact ? ' from More' : '';
  return [
    {
      title: `You lead ${nationName}`,
      icon: 'flag',
      body: `An alternate history: six powers hold today's borders but fight with 1914 technology. Win by holding ${vpToWin(world)} of ${world.totalVp} objective victory points (★) for ${proseDuration(VICTORY.holdSeconds)}, or by leading on score when the ${hoursText(limitMinutes)} campaign ends. Every nation has its own named equipment and one national speciality. The game is paused — take your time.`,
    },
    {
      title: 'The map',
      icon: 'diplomacy',
      body: touch
        ? 'Drag to pan and pinch to zoom; towns appear as you zoom in, and the fit button shows the whole theatre. Tinted land belongs to the six powers; hatched beige regions are neutral states you may invade. Dark grey land lies outside this campaign. Switch between Political, Terrain, Supply, Morale and City-size views at the top left; the last button there opens the map key.'
        : `Drag to pan, scroll to zoom${compact ? '' : ', or use the overview map at the bottom right'}; towns appear as you zoom in. Tinted land belongs to the six powers; hatched beige regions are neutral states you may invade. Dark grey land lies outside this campaign. Switch between Political, Terrain, Supply, Morale and City-size views at the top left (or cycle them with V), and press K for the map key.`,
    },
    {
      title: 'Cities and the economy',
      icon: 'factory',
      body: `The top bar shows money, materials, fuel and manpower with their change per minute; ${touch ? 'tap' : 'point at'} one for the breakdown. ${
        touch ? 'Tap one of your provinces to open its city' : 'Click one of your provinces to open its city on the right'
      }. Each city has building slots set by its size, so choose what to build: industry and exchanges for money and materials, housing to grow the city into a bigger tier with more slots, universities for research, barracks, arms and tank works to recruit, and infrastructure (forts, depots, railways) that needs no slot.`,
    },
    {
      title: 'Morale',
      icon: 'morale',
      body: "Civilian morale (0–100) drives each province's output: war, enemies at the border, battles and a lost capital lower it; garrisons, propaganda, housing and time raise it. Conquered provinces start resentful. Your national morale, shown in the top bar, caps how high your soldiers' spirits can climb.",
    },
    {
      title: 'Armies',
      icon: 'swords',
      body: `${
        touch
          ? 'Tap an army counter to select it, press Move, then tap a province or an enemy army: the route and arrival time appear, and a second tap (or Confirm) sends the army.'
          : 'Click an army counter to select it, then right-click a province or an enemy army to march there (or press Move, then click). The route and arrival time show as you point.'
      } Battles wear down strength and morale: a broken army routs to a friendly neighbour, and one with nowhere to run surrenders, so encircle the enemy. Infantry holds, artillery breaks lines from the second rank, tanks smash through open ground, anti-tank guns stop them, mountain troops own the passes. Veterans fight better.`,
    },
    {
      title: 'War, supply and research',
      icon: 'research',
      body: `Everyone starts at peace: declare war from Diplomacy ${compact ? 'in the command bar' : 'on the left command rail'}. Armies must stay connected through your territory to your capital or a Supply Depot, or they fight worse and then lose strength. Research${touch ? '' : ' (R)'} is a tree across four eras: it unlocks new units and buildings and upgrades your equipment in place. It is longer than a campaign, so choose a direction; ${
        touch ? 'tap a technology for its details, then research it or queue the whole path to it' : 'click a distant technology to queue the whole path'
      }.`,
    },
    {
      title: 'Time & saving',
      icon: 'clock',
      body: touch
        ? `The pause button in the top bar stops the clock; 1x is the real campaign pace. Save to a browser slot${saveWhere} at any time: the campaign is paused while closed and resumes exactly where you left it. Help${saveWhere} has the controls and replays this briefing.`
        : 'Space pauses. 1x is the real campaign pace; the orange DEV speeds are for testing only. Save to a browser slot at any time: the campaign is paused while closed and resumes exactly where you left it. Press H for the controls and to replay this briefing.',
    },
  ];
}

export function Tutorial({
  world,
  nationName,
  limitMinutes,
  input,
  onClose,
}: {
  world: World;
  nationName: string;
  limitMinutes: number;
  input: BriefingInput;
  onClose: () => void;
}) {
  useEscape(onClose);
  const steps = tutorialSteps(world, nationName, limitMinutes, input);
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
  ['Left-click province', 'Open its city: morale, growth, buildings, recruitment, forces present'],
  ['Left-click army counter', 'Select an army (Shift-click adds more of your armies)'],
  ['Right-click', 'March the selected armies to the province or enemy army under the cursor'],
  ['M / Move button', 'Move mode: the next left-click sets the destination'],
  ['S', 'Stop the selected armies after their current leg'],
  ['Drag / Mouse wheel', 'Pan / zoom the map (or use the overview map)'],
  ['Space', 'Pause / resume'],
  ['1 – 6', 'Speed 1x, 2x, then DEV 5x / 20x / 60x / 200x (testing only)'],
  ['R / D / L', 'Research tree / Diplomacy / field reports'],
  ['V', 'Cycle map view: political, terrain, supply, morale, city size'],
  ['K', 'Map key'],
  ['N', 'Mute or unmute sound and music (volumes: Sound on the left rail)'],
  ['H / ?', 'These controls'],
  ['Esc', 'Close the open window, cancel move mode, then clear the selection'],
];

/** The same reference for touch screens. */
export const TOUCH_CONTROLS: [string, string][] = [
  ['Tap province', 'Open its city: morale, growth, buildings, recruitment, forces present'],
  ['Tap army counter', 'Select the army'],
  ['Move, then tap', 'Preview the route and arrival time; tap the same place again (or Confirm) to march'],
  ['Stop', 'Halt the selected army after its current leg'],
  ['Drag / Pinch', 'Pan / zoom the map; the fit button shows the whole theatre'],
  ['Panel handle', 'Drag the selection panel up for more, down to close it (upright phones)'],
  ['Tap resource', 'Income, army upkeep and net change'],
  ['Tap technology', 'Its details in Research; research it, or queue the path to it, from there'],
  ['Pause / 1x / 2x', 'Pause or resume (or tap the Paused banner) and set the campaign speed'],
  ['More › Sound', 'Mute, volumes, and the music playing now'],
];
