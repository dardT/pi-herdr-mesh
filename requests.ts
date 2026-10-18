export type RequestKind = "steer" | "btw";
export type RequestState = "pending" | "done" | "error";

export interface RequestRecord {
  id: string;
  target: string;
  sender: string;
  kind: RequestKind;
  startedAt: number;
  state: RequestState;
  reply?: string;
  error?: string;
}

export interface RequestTracker {
  track(id: string, target: string, kind: RequestKind, sender: string): RequestRecord;
  mark(id: string, status: "done" | "error", text: string): RequestRecord | undefined;
  dismiss(id: string): boolean;
  list(): RequestRecord[];
  get(id: string): RequestRecord | undefined;
}

const MAX_COMPLETED = 100;

/** Creates an in-memory tracker for outgoing mesh requests; request prompt text is never retained. */
export function createRequestTracker(): RequestTracker {
  const records = new Map<string, RequestRecord>();

  function trimCompleted(): void {
    const completed = [...records.values()].filter((record) => record.state !== "pending");
    while (completed.length > MAX_COMPLETED) {
      const oldest = completed.shift();
      if (oldest) records.delete(oldest.id);
    }
  }

  return {
    track(id, target, kind, sender) {
      const record: RequestRecord = { id, target, kind, sender, startedAt: Date.now(), state: "pending" };
      records.set(id, record);
      return { ...record };
    },
    mark(id, status, text) {
      const record = records.get(id);
      if (!record) return undefined;
      delete record.reply;
      delete record.error;
      record.state = status;
      if (status === "done") record.reply = text;
      else record.error = text;
      trimCompleted();
      return { ...record };
    },
    dismiss(id) {
      return records.delete(id);
    },
    list() {
      return [...records.values()].map((record) => ({ ...record }));
    },
    get(id) {
      const record = records.get(id);
      return record && { ...record };
    },
  };
}
