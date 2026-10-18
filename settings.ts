import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

async function readSetting(path: string): Promise<boolean | undefined> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`Invalid JSON in ${path}`); }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as Record<string, unknown>).joinByDefault !== "boolean") {
    throw new Error(`Expected { "joinByDefault": boolean } in ${path}`);
  }
  return (value as { joinByDefault: boolean }).joinByDefault;
}

export async function joinByDefault(cwd: string): Promise<boolean> {
  let directory = resolve(cwd);
  while (true) {
    const setting = await readSetting(join(directory, ".mesh", "settings.json"));
    if (setting !== undefined) return setting;
    if (directory === parse(directory).root) break;
    directory = dirname(directory);
  }
  return (await readSetting(join(homedir(), ".pi", "agent", "mesh", "settings.json"))) ?? false;
}
