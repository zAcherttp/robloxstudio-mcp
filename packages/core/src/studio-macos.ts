import * as path from 'path';
import type { StudioProcessInfo } from './studio-instance-manager.js';

// macOS specifics for managed Studio processes (fork-local, see LOCAL.md).
//
// - Studio started by exec'ing its binary exits within ~25 s before opening the
//   place; started through LaunchServices (`open -n -a`) with the same arguments
//   it runs. So a launch goes through `open -g` (in the background: Studio never
//   takes the front while it loads) and finds the new PID by its exact arguments,
//   since `open` does not return it.
// - `pgrep -fl RobloxStudio` also lists the crash handler, StudioMCP and wrappers
//   around them, and macOS gives no window titles, so a connected instance is
//   matched by the place file on the Studio command line instead.
// - A modal dialog (save changes, low system resources) swallows both SIGTERM
//   and a quit Apple Event. A Studio running a local place file is a scratch copy
//   of something on disk; closing one may force-kill it after a grace period.

const STUDIO_EXECUTABLE = /^\S*\.app\/Contents\/MacOS\/RobloxStudio(?=\s|$)/;
const LOCAL_PLACE_FILE = /(?:^|\s)--localPlaceFile\s+(.+?)(?=\s+-{1,2}[A-Za-z]|\s*$)/;

export const MAC_FORCE_CLOSE_GRACE_MS = 2000;

export interface MacStudioChildProcess {
  pid: number;
  nativePid: number;
  unref: () => void;
  onExit: (listener: (code: number | null, signal: NodeJS.Signals | null) => void) => void;
}

export interface MacLaunchDependencies {
  runOpen: (args: string[]) => Promise<unknown>;
  listProcesses: () => Promise<StudioProcessInfo[]>;
  isAlive: (pid: number) => boolean;
  delay: (ms: number) => Promise<void>;
  now: () => number;
  watchIntervalMs?: number;
}

export interface MacConnectedInstance {
  instanceId: string;
  placeName: string;
  dataModelName: string;
}

export function parseMacStudioProcesses(output: string): StudioProcessInfo[] {
  const processes: StudioProcessInfo[] = [];
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    const space = line.indexOf(' ');
    if (space <= 0) continue;
    const pid = Number(line.slice(0, space));
    const commandLine = line.slice(space + 1).trim();
    if (!Number.isSafeInteger(pid) || pid <= 0 || !STUDIO_EXECUTABLE.test(commandLine)) continue;
    processes.push({ Id: pid, Name: 'RobloxStudio', Path: commandLine, CommandLine: commandLine, MainWindowTitle: '' });
  }
  return processes;
}

export function localPlaceFileOf(commandLine: string | undefined): string | undefined {
  const match = commandLine ? LOCAL_PLACE_FILE.exec(commandLine) : null;
  return match ? match[1] : undefined;
}

export function appBundleOf(executable: string): string | undefined {
  const match = /^(.+\.app)\/Contents\/MacOS\/[^/]+$/.exec(executable);
  return match ? match[1] : undefined;
}

function namesOf(instance: MacConnectedInstance): Set<string> {
  const names = new Set<string>();
  for (const name of [instance.placeName, instance.dataModelName]) {
    const trimmed = name.trim();
    if (trimmed.length > 0) names.add(trimmed);
  }
  return names;
}

export function findMacProcessForConnectedInstance(
  instance: MacConnectedInstance,
  processes: StudioProcessInfo[],
): StudioProcessInfo | undefined {
  const names = namesOf(instance);
  const candidates = processes.filter((proc) => {
    const file = localPlaceFileOf(proc.CommandLine ?? proc.Path);
    if (!file) return false;
    const base = path.basename(file);
    return names.has(base) || names.has(base.replace(/\.rbxlx?$/i, ''));
  });
  if (candidates.length > 1) {
    throw new Error(
      `Multiple Studio processes run a local place file named like connected instance "${instance.instanceId}".`,
    );
  }
  return candidates[0];
}

function watchExit(pid: number, deps: MacLaunchDependencies): MacStudioChildProcess['onExit'] {
  return (listener) => {
    const timer = setInterval(() => {
      if (deps.isAlive(pid)) return;
      clearInterval(timer);
      listener(null, null);
    }, deps.watchIntervalMs ?? 1000);
    timer.unref?.();
  };
}

export async function launchMacStudio(
  bundle: string,
  args: string[],
  environment: Record<string, string> | undefined,
  deps: MacLaunchDependencies,
  timeoutMs = 15000,
): Promise<MacStudioChildProcess> {
  const before = new Set((await deps.listProcesses()).map((proc) => proc.Id));
  const environmentArgs = Object.entries(environment ?? {}).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  await deps.runOpen(['-g', '-n', '-a', bundle, ...environmentArgs, '--args', ...args]);
  const wanted = args.join(' ');
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    const created = (await deps.listProcesses())
      .filter((proc) => !before.has(proc.Id) && (proc.CommandLine ?? proc.Path ?? '').includes(wanted));
    if (created.length > 1) {
      throw new Error(`open -n -a ${bundle} started more than one Studio with the same arguments.`);
    }
    if (created.length === 1) {
      const pid = created[0].Id;
      return { pid, nativePid: pid, unref: () => {}, onExit: watchExit(pid, deps) };
    }
    if (deps.now() >= deadline) {
      throw new Error(`Studio did not appear within ${timeoutMs} ms of open -n -a ${bundle}.`);
    }
    await deps.delay(250);
  }
}
