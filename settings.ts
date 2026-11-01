import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import type { SteeringMode } from "./steering.js";

export type MeshSettings = { joinByDefault: boolean; steeringMode: SteeringMode };
type PartialSettings = Partial<MeshSettings>;

async function readSetting(path: string): Promise<PartialSettings | undefined> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`Invalid JSON in ${path}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected mesh settings object in ${path}`);
  const settings = value as Record<string, unknown>;
  if (settings.joinByDefault !== undefined && typeof settings.joinByDefault !== "boolean") throw new Error(`Expected boolean joinByDefault in ${path}`);
  if (settings.steeringMode !== undefined && settings.steeringMode !== "exclusive" && settings.steeringMode !== "fifo") throw new Error(`Expected steeringMode to be "exclusive" or "fifo" in ${path}`);
  return { joinByDefault: settings.joinByDefault as boolean | undefined, steeringMode: settings.steeringMode as SteeringMode | undefined };
}

export async function meshSettings(cwd: string): Promise<MeshSettings> {
  const settings: PartialSettings = {};
  let directory = resolve(cwd);
  while (true) {
    const current = await readSetting(join(directory, ".mesh", "settings.json"));
    settings.joinByDefault ??= current?.joinByDefault;
    settings.steeringMode ??= current?.steeringMode;
    if (directory === parse(directory).root) break;
    directory = dirname(directory);
  }
  const global = await readSetting(join(homedir(), ".pi", "agent", "mesh", "settings.json"));
  return { joinByDefault: settings.joinByDefault ?? global?.joinByDefault ?? false, steeringMode: settings.steeringMode ?? global?.steeringMode ?? "exclusive" };
}
