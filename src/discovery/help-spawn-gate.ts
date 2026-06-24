/**
 * Process-wide limit on concurrent help subprocesses (az -h / gh --help).
 * Prevents N connectors × concurrency from spawning hundreds of CLIs at once.
 */
export class HelpSpawnGate {
  private max: number;
  private inFlight = 0;
  private waiters: Array<() => void> = [];

  constructor(maxInflight: number) {
    this.max = Math.max(1, maxInflight);
  }

  async acquire(): Promise<void> {
    if (this.inFlight < this.max) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.inFlight++;
        resolve();
      });
    });
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.waiters.shift();
    if (next) next();
  }

  stats(): { max: number; in_flight: number; waiting: number } {
    return { max: this.max, in_flight: this.inFlight, waiting: this.waiters.length };
  }
}