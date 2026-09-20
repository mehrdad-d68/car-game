const EPSILON = 1e-9;

export class FixedStepLoop {
  private accumulator = 0;
  paused = false;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly fixedDelta = 1 / 60,
    private readonly maxFrameDelta = 0.25,
  ) {}

  advance(frameDelta: number): number {
    if (this.paused) return 0;
    this.accumulator += Math.min(frameDelta, this.maxFrameDelta);

    while (this.accumulator >= this.fixedDelta - EPSILON) {
      this.step(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
    }

    return this.accumulator / this.fixedDelta;
  }
}
