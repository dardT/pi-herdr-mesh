export type SteeringMode = "exclusive" | "fifo" | "sender-group";

/** Admission and ordering for target-side steering requests; execution stays with Pi. */
export function createSteeringCoordinator<T extends { from: string }>(mode: SteeringMode, groupWindowMs = 500) {
  const queued: T[] = [];
  let firstQueuedAt: number | undefined;

  return {
    mode,
    get queued() { return [...queued]; },
    get readyInMs(): number { return mode === "sender-group" && firstQueuedAt !== undefined ? Math.max(0, firstQueuedAt + groupWindowMs - Date.now()) : 0; },
    admit(job: T, busy: boolean): "start" | "queued" | "rejected" {
      if (mode !== "sender-group" && !busy && !queued.length) return "start";
      if (mode === "exclusive") return "rejected";
      if (!queued.length) firstQueuedAt = Date.now();
      queued.push(job);
      return "queued";
    },
    nextBatch(): T[] {
      if (!queued.length || (mode === "sender-group" && firstQueuedAt !== undefined && Date.now() < firstQueuedAt + groupWindowMs)) return [];
      const first = queued.shift()!;
      const batch = [first];
      if (mode === "sender-group") {
        for (let i = 0; i < queued.length && batch.length < 10;) {
          if (queued[i].from === first.from) batch.push(queued.splice(i, 1)[0]);
          else i++;
        }
      }
      firstQueuedAt = queued.length ? Date.now() : undefined;
      return batch;
    },
    cancel(job: T): boolean {
      const index = queued.indexOf(job);
      if (index < 0) return false;
      queued.splice(index, 1);
      if (!queued.length) firstQueuedAt = undefined;
      else if (index === 0) firstQueuedAt = Date.now();
      return true;
    },
    clear(): void { queued.length = 0; firstQueuedAt = undefined; },
  };
}
