import {
  appBundleOf,
  findMacProcessForConnectedInstance,
  launchMacStudio,
  localPlaceFileOf,
  parseMacStudioProcesses,
} from '../studio-macos.js';
import type { StudioProcessInfo } from '../studio-instance-manager.js';

const STUDIO = '/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio';
const SCRATCH = '/private/tmp/scratch/bugs-scratch.rbxl';

const PGREP = [
  `24265 ${STUDIO}`,
  '24267 /Applications/RobloxStudio.app/Contents/MacOS/RobloxCrashHandler --no-rate-limit --crashCounter Mac-ROBLOXStudio-Crash',
  '48047 /Applications/Claude.app/Contents/Helpers/disclaimer --pgroup -- /Applications/RobloxStudio.app/Contents/MacOS/StudioMCP',
  '48049 /Applications/RobloxStudio.app/Contents/MacOS/StudioMCP',
  `65609 ${STUDIO} --task EditFile --localPlaceFile ${SCRATCH}`,
  `73866 ${STUDIO} -task StartServer -edittargetid 5ab99668 -placeVersion 0`,
  '',
].join('\n');

describe('macOS Studio process enumeration', () => {
  test('keeps only Studio executables, with their command lines', () => {
    const processes = parseMacStudioProcesses(PGREP);
    expect(processes.map((proc) => proc.Id)).toEqual([24265, 65609, 73866]);
    expect(processes[1]).toMatchObject({
      Name: 'RobloxStudio',
      CommandLine: `${STUDIO} --task EditFile --localPlaceFile ${SCRATCH}`,
      MainWindowTitle: '',
    });
  });

  test('reads the place file from the command line', () => {
    expect(localPlaceFileOf(`${STUDIO} --task EditFile --localPlaceFile ${SCRATCH}`)).toBe(SCRATCH);
    expect(localPlaceFileOf(`${STUDIO} --localPlaceFile /tmp/My Place.rbxl --task EditFile`)).toBe('/tmp/My Place.rbxl');
    expect(localPlaceFileOf(STUDIO)).toBeUndefined();
    expect(localPlaceFileOf(undefined)).toBeUndefined();
  });

  test('derives the app bundle from the executable', () => {
    expect(appBundleOf(STUDIO)).toBe('/Applications/RobloxStudio.app');
    expect(appBundleOf('/usr/local/bin/RobloxStudio')).toBeUndefined();
  });
});

describe('macOS connected instance lookup', () => {
  const processes = parseMacStudioProcesses(PGREP);

  test('matches the Studio running the place file named like the instance', () => {
    const found = findMacProcessForConnectedInstance(
      { instanceId: 'instance:a', placeName: 'bugs-scratch.rbxl', dataModelName: 'bugs-scratch.rbxl' },
      processes,
    );
    expect(found?.Id).toBe(65609);
    expect(findMacProcessForConnectedInstance(
      { instanceId: 'instance:a', placeName: 'bugs-scratch', dataModelName: '' },
      processes,
    )?.Id).toBe(65609);
  });

  test('never picks a Studio without a local place file, even when it is the only one', () => {
    const only: StudioProcessInfo[] = parseMacStudioProcesses(`24265 ${STUDIO}`);
    expect(findMacProcessForConnectedInstance(
      { instanceId: 'instance:b', placeName: 'Place1', dataModelName: 'Place1' },
      only,
    )).toBeUndefined();
  });

  test('refuses when two Studios run place files with the same name', () => {
    const twice = parseMacStudioProcesses([
      `1 ${STUDIO} --task EditFile --localPlaceFile /a/scratch.rbxl`,
      `2 ${STUDIO} --task EditFile --localPlaceFile /b/scratch.rbxl`,
    ].join('\n'));
    expect(() => findMacProcessForConnectedInstance(
      { instanceId: 'instance:c', placeName: 'scratch.rbxl', dataModelName: 'scratch.rbxl' },
      twice,
    )).toThrow(/Multiple Studio processes/);
  });
});

describe('macOS launch through LaunchServices', () => {
  const args = ['--task', 'EditFile', '--localPlaceFile', SCRATCH];

  function deps(lists: StudioProcessInfo[][], alive = () => true) {
    let clock = 0;
    const runOpen = jest.fn(async () => undefined);
    return {
      runOpen,
      deps: {
        runOpen,
        listProcesses: jest.fn(async () => lists.length > 1 ? lists.shift()! : lists[0]),
        isAlive: jest.fn(alive),
        delay: async (ms: number) => { clock += ms; },
        now: () => clock,
        watchIntervalMs: 5,
      },
    };
  }

  test('opens a new instance and returns the new PID found by its arguments', async () => {
    const existing = parseMacStudioProcesses(`24265 ${STUDIO}`);
    const started = parseMacStudioProcesses([`24265 ${STUDIO}`, `90001 ${STUDIO} ${args.join(' ')}`].join('\n'));
    const { runOpen, deps: d } = deps([existing, existing, started]);
    const proc = await launchMacStudio('/Applications/RobloxStudio.app', args, { RSMCP_X: '1' }, d);
    expect(runOpen).toHaveBeenCalledWith([
      '-g', '-n', '-a', '/Applications/RobloxStudio.app', '--env', 'RSMCP_X=1', '--args', ...args,
    ]);
    expect(proc).toMatchObject({ pid: 90001, nativePid: 90001 });
  });

  test('a Studio that was already running the same place is not taken for the new one', async () => {
    const before = parseMacStudioProcesses(`65609 ${STUDIO} ${args.join(' ')}`);
    const { deps: d } = deps([before]);
    await expect(launchMacStudio('/Applications/RobloxStudio.app', args, undefined, d, 1000))
      .rejects.toThrow(/did not appear within 1000 ms/);
  });

  test('reports the exit of the launched process', async () => {
    const started = parseMacStudioProcesses(`90002 ${STUDIO} ${args.join(' ')}`);
    let alive = true;
    const { deps: d } = deps([[], started], () => alive);
    const proc = await launchMacStudio('/Applications/RobloxStudio.app', args, undefined, d);
    const exited = new Promise<void>((resolve) => proc.onExit(() => resolve()));
    alive = false;
    await exited;
  });
});
