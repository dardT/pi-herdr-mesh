import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const execFile = promisify(execFileCallback);

export type PeerRecord = {
  id: string;
  pid: number;
  startedAt: number;
  cwd: string;
  branch?: string;
  name?: string;
  workspaceId?: string;
  workspaceKey?: string;
  listening: boolean;
  activity: "idle" | "busy" | "answering-btw";
  queuedBtw: number;
  revision: string;
  purpose?: string;
  purposeRevision?: string;
};

type Registration = Omit<PeerRecord, "purpose" | "purposeRevision">;

const uid = process.getuid?.() ?? process.env.USER ?? "user";
const directory = join(tmpdir(), `pi-mesh-${uid}`);
const registrations = join(directory, "peers");
const snapshotPath = join(directory, "catalog.json");
const lockPath = join(directory, "catalog.lock");
const execFileAsync = async (file: string, args: string[]) => execFile(file, args, { timeout: 2_000 });

/** Scope workspace IDs to their Herdr server: separate servers can reuse IDs such as w1. */
export function herdrWorkspaceKey(): string | undefined {
  const { HERDR_ENV, HERDR_SOCKET_PATH, HERDR_WORKSPACE_ID } = process.env;
  if (HERDR_ENV !== "1" || !HERDR_SOCKET_PATH || !HERDR_WORKSPACE_ID) return undefined;
  return createHash("sha256").update(HERDR_SOCKET_PATH).update("\0").update(HERDR_WORKSPACE_ID).digest("hex");
}

async function secureDirectory() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await stat(directory);
  if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
    throw new Error(`Unsafe catalog directory: ${directory}`);
  }
  await mkdir(registrations, { recursive: true, mode: 0o700 });
  const entries = await stat(registrations);
  if (!entries.isDirectory() || entries.uid !== process.getuid?.() || (entries.mode & 0o077) !== 0) {
    throw new Error(`Unsafe catalog registrations directory: ${registrations}`);
  }
}

async function atomicWrite(path: string, contents: string) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch { return undefined; }
}

async function withLock<T>(work: () => Promise<T>): Promise<T> {
  await secureDirectory();
  let acquired = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      await writeFile(join(lockPath, "owner"), `${process.pid}\n${Date.now()}`, { mode: 0o600 });
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const owner = (await readFile(join(lockPath, "owner"), "utf8")).split("\n");
        const pid = Number(owner[0]);
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); }
          catch (failure) {
            if ((failure as NodeJS.ErrnoException).code === "ESRCH") await rm(lockPath, { recursive: true, force: true });
          }
        } else if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) {
          await rm(lockPath, { recursive: true, force: true });
        }
      } catch { /* Another process may be creating or releasing the lock. */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (!acquired) throw new Error("Timed out waiting for the Pi Mesh catalog lock");
  try { return await work(); }
  finally { await rm(lockPath, { recursive: true, force: true }); }
}

function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function discover(): Promise<Registration[]> {
  await secureDirectory();
  const found: Registration[] = [];
  for (const file of await readdir(registrations)) {
    if (!file.endsWith(".json")) continue;
    const path = join(registrations, file);
    const record = await readJson<Registration>(path);
    if (!record || !alive(record.pid)) {
      await rm(path, { force: true }).catch(() => {});
      continue;
    }
    if (typeof record.id === "string" && typeof record.cwd === "string" && typeof record.revision === "string") found.push(record);
  }
  return found;
}

async function readSnapshot(): Promise<PeerRecord[]> {
  const snapshot = await readJson<PeerRecord[]>(snapshotPath);
  return Array.isArray(snapshot) ? snapshot.filter((peer) => peer && typeof peer.id === "string") : [];
}

async function saveSnapshot(peers: PeerRecord[]) {
  await atomicWrite(snapshotPath, JSON.stringify(peers));
}

async function revisionFor(ctx: ExtensionContext): Promise<string> {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.type === "message" && entry.message?.role !== "custom") return entry.id;
  }
  return "";
}

async function metadata(ctx: ExtensionContext, id: string, listening: boolean, activity: Registration["activity"], queuedBtw: number): Promise<Registration> {
  const cwd = ctx.cwd;
  let branch: string | undefined;
  try { branch = (await execFileAsync("git", ["-C", cwd, "symbolic-ref", "--short", "HEAD"])).stdout.trim() || undefined; }
  catch { /* Not in a git worktree, or no symbolic branch. */ }
  const prior = await readJson<Registration>(join(registrations, `${encodeURIComponent(id)}.json`));
  const workspaceKey = herdrWorkspaceKey();
  return {
    id,
    pid: process.pid,
    startedAt: prior?.pid === process.pid ? prior.startedAt : Date.now(),
    cwd,
    ...(branch ? { branch } : {}),
    ...(ctx.sessionManager.getSessionName() ? { name: ctx.sessionManager.getSessionName() } : {}),
    ...(workspaceKey ? { workspaceId: process.env.HERDR_WORKSPACE_ID, workspaceKey } : {}),
    listening,
    activity,
    queuedBtw,
    revision: await revisionFor(ctx),
  };
}

export function createCatalog(selfId: string) {
  const registrationPath = join(registrations, `${encodeURIComponent(selfId)}.json`);
  let version = 0;

  return {
    async announce(ctx: ExtensionContext, listening: boolean, activity: Registration["activity"] = ctx.isIdle() ? "idle" : "busy", queuedBtw = 0): Promise<void> {
      const currentVersion = ++version;
      const record = await metadata(ctx, selfId, listening, activity, queuedBtw);
      if (currentVersion !== version) return;
      await withLock(async () => {
        if (currentVersion !== version) return;
        const duplicate = (await discover()).find((peer) => peer.id === selfId && peer.pid !== process.pid);
        if (duplicate) throw new Error(`Catalog ID ${selfId} is already registered by process ${duplicate.pid}`);
        await atomicWrite(registrationPath, JSON.stringify(record));
        const old = new Map((await readSnapshot()).map((peer) => [peer.id, peer]));
        const current = await discover();
        await saveSnapshot(current.map((peer) => {
          const previous = old.get(peer.id);
          return { ...peer, ...(previous?.purpose === undefined ? {} : { purpose: previous.purpose }), ...(previous?.purposeRevision === undefined ? {} : { purposeRevision: previous.purposeRevision }) };
        }));
      });
    },

    async withdraw(): Promise<void> {
      ++version;
      await withLock(async () => {
        const existing = await readJson<Registration>(registrationPath);
        if (existing?.pid === process.pid) await rm(registrationPath, { force: true });
        const peers = await discover();
        const old = new Map((await readSnapshot()).map((peer) => [peer.id, peer]));
        await saveSnapshot(peers.map((peer) => ({ ...peer, purpose: old.get(peer.id)?.purpose, purposeRevision: old.get(peer.id)?.purposeRevision })));
      });
    },

    async list(): Promise<PeerRecord[]> {
      return withLock(async () => {
        const previous = new Map((await readSnapshot()).map((peer) => [peer.id, peer]));
        const peers = (await discover()).map((peer): PeerRecord => ({
          ...peer,
          purpose: previous.get(peer.id)?.purpose,
          purposeRevision: previous.get(peer.id)?.purposeRevision,
        }));
        await saveSnapshot(peers);
        return peers;
      });
    },

    async refresh(
      id: string | undefined,
      purposeFor: (peer: PeerRecord) => Promise<string>,
      workspaceKey?: string,
      onProgress?: (completed: number, total: number) => void,
    ): Promise<PeerRecord[]> {
      const candidates = await withLock(async () => {
        const old = new Map((await readSnapshot()).map((peer) => [peer.id, peer]));
        const peers = (await discover()).map((registration): PeerRecord => {
          const previous = old.get(registration.id);
          return {
            ...registration,
            ...(previous?.purpose === undefined ? {} : { purpose: previous.purpose }),
            ...(previous?.purposeRevision === undefined ? {} : { purposeRevision: previous.purposeRevision }),
          };
        });
        await saveSnapshot(peers);
        return peers.filter((peer) => peer.listening && peer.revision !== peer.purposeRevision && (id === undefined || id === peer.id) && (workspaceKey === undefined || peer.workspaceKey === workspaceKey));
      });

      onProgress?.(0, candidates.length);
      let completed = 0;
      for (const candidate of candidates) {
        try {
          let purpose: string;
          try { purpose = await purposeFor(candidate); }
          catch { continue; }
          await withLock(async () => {
            const live = (await discover()).find((peer) => peer.id === candidate.id);
            if (!live || live.pid !== candidate.pid || live.revision !== candidate.revision || !live.listening) return;
            const peers = await readSnapshot();
            const index = peers.findIndex((peer) => peer.id === candidate.id);
            if (index < 0 || peers[index].pid !== candidate.pid || peers[index].revision !== candidate.revision) return;
            peers[index] = { ...peers[index], purpose, purposeRevision: candidate.revision };
            await saveSnapshot(peers);
          });
        } finally {
          onProgress?.(++completed, candidates.length);
        }
      }
      return this.list();
    },
  };
}
