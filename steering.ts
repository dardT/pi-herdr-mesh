export type SteeringMode = "exclusive" | "fifo" | "sender-group" | "batch";

/** Admission and ordering for target-side steering requests; execution stays with Pi. */
export function createSteeringCoordinator<T extends { from: string }>(mode: SteeringMode, collectionWindowMs = 500) {
  const queued: T[] = [];
  let firstQueuedAt: number | undefined;

  return {
    mode,
    get queued() { return [...queued]; },
    get readyInMs(): number { return (mode === "sender-group" || mode === "batch") && firstQueuedAt !== undefined ? Math.max(0, firstQueuedAt + collectionWindowMs - Date.now()) : 0; },
    admit(job: T, busy: boolean): "start" | "queued" | "rejected" {
      if (mode !== "sender-group" && mode !== "batch" && !busy && !queued.length) return "start";
      if (mode === "exclusive") return "rejected";
      if (!queued.length) firstQueuedAt = Date.now();
      queued.push(job);
      return "queued";
    },
    nextBatch(): T[] {
      if (!queued.length || ((mode === "sender-group" || mode === "batch") && firstQueuedAt !== undefined && Date.now() < firstQueuedAt + collectionWindowMs)) return [];
      const first = queued.shift()!;
      const batch = [first];
      if (mode === "batch") batch.push(...queued.splice(0, 9));
      else if (mode === "sender-group") {
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
