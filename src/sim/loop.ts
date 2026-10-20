// Real-time driver for the fixed-timestep simulation. Framework-free: the UI
// feeds it elapsed wall-clock milliseconds (from requestAnimationFrame) and it
// runs whole ticks. Frame timing only changes *when* ticks run, never what
// they compute.
import { MAX_TICKS_PER_FRAME } from './config/timing';

export const MS_PER_TICK = 1000;

export class GameLoop {
  private accumulator = 0;
  paused = true;
  speed = 1;

  constructor(private readonly stepFn: () => boolean) {}

  /**
   * Advance by `elapsedMs` of real time. Returns ticks executed.
   * `stepFn` returns false when the game has ended (stops the loop).
   */
  advance(elapsedMs: number): number {
    if (this.paused) return 0;
    this.accumulator += Math.max(0, elapsedMs) * this.speed;
    let ticks = 0;
    while (this.accumulator >= MS_PER_TICK && ticks < MAX_TICKS_PER_FRAME) {
      this.accumulator -= MS_PER_TICK;
      ticks++;
      if (!this.stepFn()) {
        this.accumulator = 0;
        this.paused = true;
        break;
      }
    }
    // Do not bank more than one frame's worth of backlog (e.g. after a stall).
    if (ticks >= MAX_TICKS_PER_FRAME) this.accumulator = 0;
    return ticks;
  }

  /** 0..1 progress towards the next tick, for smooth interpolation in rendering. */
  get alpha(): number {
    return Math.min(1, this.accumulator / MS_PER_TICK);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
