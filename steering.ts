export type SteeringMode = "exclusive" | "fifo";

/** Admission and ordering for target-side steering requests; execution stays with Pi. */
export function createSteeringCoordinator<T>(mode: SteeringMode) {
  const queued: T[] = [];

  return {
    mode,
    get queued() { return [...queued]; },
    admit(job: T, busy: boolean): "start" | "queued" | "rejected" {
      if (!busy && !queued.length) return "start";
      if (mode === "exclusive") return "rejected";
      queued.push(job);
      return "queued";
    },
    next(): T | undefined { return queued.shift(); },
    cancel(job: T): boolean {
      const index = queued.indexOf(job);
      if (index < 0) return false;
      queued.splice(index, 1);
      return true;
    },
    clear(): void { queued.length = 0; },
  };
}
