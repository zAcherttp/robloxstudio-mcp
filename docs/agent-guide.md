# Driving Roblox Studio as an agent

For any coding agent working on any Roblox game through this MCP. It assumes no framework, no
folder layout and no particular game. Everything below was measured in Studio in September 2026
unless it says otherwise; the engine moves weekly, so a claim with a date is a claim to re-check.

**Use the MCP, not computer use.** Clicking Studio's UI through screen control is slower, less
precise and cannot read a number back. Every tool here returns structured data you can assert on.

`get_project_lessons` serves the one-line version of the traps on this page, plus your project's
own `LESSONS.md`. This page is the long form, with the measurements behind them.

## The shape of it

```
your editor ──(Rojo, Script Sync, or edit in Studio)──► Studio
                                                         ├─ execute_luau          the edit DataModel (or a play peer, as the plugin)
                                                         ├─ solo_playtest         start / stop / status of a play session
                                                         ├─ eval_server_runtime   the play server
                                                         ├─ eval_client_runtime   a play client
                                                         ├─ get_runtime_logs      output, warnings, errors
                                                         └─ capture_screenshot    what it looks like
```

How code reaches Studio is your team's choice: Rojo, Studio's own Script Sync, or editing scripts
in place with `set_script_source` / `edit_script_lines`. The MCP works with all three.

**Edit mode and a playtest are different DataModels.** `execute_luau` reaches the edit one and
cannot see a running game unless you pass `target: "server"` or `"client-1"`.
`eval_server_runtime` and `eval_client_runtime` reach the play session, and are two separate
sides: one call runs on one of them.

**`execute_luau` with a `target` runs as the plugin**, with the Plugin capability. The eval tools
run as game scripts, with the game's `require` cache and without that capability. Use the eval
tools to exercise game code, and `execute_luau` with a target for anything that needs plugin
rights (heap snapshots, some services).

## Patterns that work

**Drive from the server, sample on the client.** The default control script rewrites
`Humanoid.MoveDirection` every frame, so a client-side `Humanoid:Move` moves nothing. Move the
character with `eval_server_runtime`; read the result with `eval_client_runtime`.

**Arm, trigger, read.** One call cannot span both sides, and a transient thing (a flight, a
shake, a flash) is over before a second call lands. Install a sampler into `_G` on one side,
trigger from the other, then read it back:

```lua
-- client: arm
local peak = 0
local conn = RunService.RenderStepped:Connect(function() peak = math.max(peak, measure()) end)
_G.Probe = function() conn:Disconnect() return peak end
-- server: trigger the thing
-- client: read
return _G.Probe()
```

**Long work goes in the background.** An eval call times out at about 30 seconds and keeps running
with its result lost. `task.spawn` the work, write results into `_G`, and poll with short calls.

**Compare against the server's own value.** The server never moves an anchored part it owns, so
client versus server position *is* the drift test. Ground truth beats a remembered "before".

**Clone-require in edit mode.** Studio caches each ModuleScript's return value, and Rojo rewrites
`Source` in place, so an edited module keeps handing back its old table, and **a Studio restart
does not clear it**. Only a clone sees current code:

```lua
local clone = module:Clone()
module.Name, clone.Name = module.Name .. "_stashed", module.Name
clone.Parent = module.Parent
local fresh = require(clone)
```

Anything the module requires is cached the same way. Before believing a result, check `.Source`
for a string you just wrote.

**Leave the playtest as you found it.** The playtest an agent drives is the one the person is
watching. A probe that anchors or moves their character and does not undo it, error path
included, reads to them as a broken game.

**Give the agent a way in that is not clicking.** A feature only reachable by playing cannot be
verified by an agent. Whatever architecture you choose, give each gameplay feature a
Studio-only entry point (a command, a bindable, a debug function) that calls **the same server
code as player input**, and a way to read its result back. Then the agent can drive it with one
eval and assert on the answer.

## This engine, as of 2026-09

Things older Roblox advice (and most model training data) gets wrong:

- **The default PlayerModule is not in PlayerScripts.** It runs from `StarterPlayer.PlayerModule`,
  and requiring it returns an empty table: no `GetControls`. Movement goes through the **Input
  Action System**: read the stick from
  `StarterPlayer.PlayerModule.InputContexts.CharacterContext.MoveAction:GetState()`, a Vector2 with
  y forward. `simulate_keyboard_input` W reads (0, 1).
- **Avatars are jointed with AnimationConstraints**, not Motor6Ds, each with a
  BallSocketConstraint beside it. They are kinematic, so the avatar is still one rigid assembly
  rooted at the HumanoidRootPart and `Massless` still works. Code that walks Motor6Ds to find a
  joint finds nothing; weld what you attach rather than computing an offset through the rig. The
  rig cannot be posed from the server: publish an animation and play it on the client's Animator.
- **The 3D Importer turns FBX meshes half round about Y** and reads FBX centimetres as studs. A
  mesh exported facing -Z arrives facing +Z with its size and winding untouched, so nothing looks
  wrong until you see the back from the front. Set sizes from your own layout.
- **Server Authority** (`Workspace.AuthorityMode`) changes what replicates; see below. It cannot be
  set from a script, only in Studio followed by a save and reopen.

## Properties the engine owns

Roblox rewrites some properties every frame from systems you never asked for. A write to one is
gone before it is drawn, and any measurement taken through it returns a real-looking number.

| Property | What owns it | What happens |
|---|---|---|
| `Motor6D.Transform` | the Animator, on **every** joint in a character, including ones no track mentions | write 25°, read back 0 |
| `AnimationConstraint.Transform` | the same | a 60° drive measured 1.7° |
| `Humanoid.MoveDirection` | read-only; the control script drives it through `Humanoid:Move` each frame | your own `Move` is overridden |
| `LocalTransparencyModifier` | the character-transparency pass, **as a part joins the character** | wiped on a part that just arrived; held on one that had been there a while |

The last row is the shape to watch for: it tests as working and fails in exactly the case that
matters. Two have a neighbour that works: drive a custom joint through `C0`, and hide a part with
plain `Transparency`.

**Before building on a property write, check it holds:** write, wait a frame, read back, restore.
Two frames, and it would have caught every row above.

## Measuring without fooling yourself

Four measurements once came back as clean, plausible numbers and every one was wrong. None of the
bugs were subtle; what made them expensive is that the instrument agreed with the mistake.

- **Driving a character from the client** moves nothing (see above), so whatever you measure reads
  as barely happening. *Tell:* two different inputs produced byte-identical numbers.
- **Sampling while something is still settling** reads as permanent drift. *Fix:* compare against
  the server's value and sample twice, seconds apart: a drifted thing sits still in the wrong
  place, a settling one is still moving.
- **A harness that changes the thing it measures.** Holding a movement key for twelve actions
  walked the player 77 studs away and then reported that half the actions missed. *Fix:* measure
  one action.
- **Testing on the wrong instance.** A mechanism asserted from a nearby case is a guess. *Fix:*
  test the case it is supposed to explain.
- **Kicking a body the engine pulls smoothly.** Impulses at the start of each frame against
  gravity, which is integrated over the frame's substeps, balance only at frame boundaries: a
  parked body crept uphill at 0.47 studs/s while every sampled velocity read 0.000. *Tell:*
  position changing while velocity reads exactly zero. *Fix:* hold weight with a steady
  `VectorForce`, set once, and kick in only what is left.
- **A value written and never read** is set, replicated and saved perfectly, and reaches no one.
  After adding one, search for its readers.

## Screenshots

`capture_screenshot` grabs the Studio window through the host OS, so it works while Studio is
behind other windows, in edit mode and during a playtest.

- **macOS** needs **Screen Recording permission for whichever app launched the MCP server**
  (Claude, a terminal, Codex: each needs its own grant). The tool checks and says so; it never
  asks. The first screenshot after a server starts takes about 25 seconds while a helper compiles
  (needs Xcode command-line tools and macOS 14); without those it falls back to `screencapture`.
- **Windows** captures through PowerShell. It is upstream's original path.
- It captures exactly one Studio window, the one whose title matches the place, and refuses when
  two windows of the same place are open.
- `selection` with `action: "view"` frames an instance first. It cannot frame a `Folder`; pass a
  Part or a Model.

Screenshots answer "does this look right". They do not answer "is this correct": for that, read
the numbers back.

## Studio's own CPU and memory

**Where to look.** The OS view is ground truth. On macOS: `footprint <pid>` for memory,
`ps -M -p <pid>` for per-thread CPU. On Windows: Task Manager's details view or
`Get-Process RobloxStudioBeta`. Inside Studio, `Stats.PerformanceStats.Memory` holds the Developer
Console's full memory tree, and `gcinfo()` on each peer gives that VM's Luau heap.

**Most of Studio's ~3.6 GB is Studio.** Freshly restarted, with a playtest running and only Rojo
and the MCP plugin installed: 3,629 MB. `PlaceMemory.LuaHeap` was about 760 MB while the game's
own VMs held about 13 MB: the rest is Studio's built-in tools, written in Luau. Script analysis
for open scripts is about 230 MB. None of it is yours to shrink.

**A playtest leaves 10–15 MB behind** in the OS footprint per play/stop cycle. Studio's own
categories claim more, but that is accounting moving between them; compare `footprint`, not one
category. Restart Studio after long agent sessions.

**Plugins run in every DataModel.** A playtest loads each plugin into the edit, server and client
DataModels, so a plugin's per-frame cost is paid three times. One tag-editing plugin re-rendered
its tooltip every frame and cost more server time than the game itself. Keep the plugin set small.

**In the background** Studio renders the play client at about 15 fps but keeps simulating at
60 Hz, so a playtest left running costs about half a core. Stop it when stepping away.

**100% CPU in the background was an engine bug, not a script.** Studio's `HttpClient` thread spun
at 100% on a socket the far end had closed (`lsof` showed it `CLOSED`). Only a restart cleared it.
If CPU pins, check for that before profiling your game.

**Finding a leak.** `SceneAnalysisService:GetUnparentedInstancesAsync()` on a play peer is the
quickest check. For Luau memory, `capture_heap_snapshot` writes a heap report to a file and
returns what holds memory by category, type and retention root; take one before and one after the
suspected action and pass the first as `compare_path` to see what grew.
`capture_micro_profiler` returns more than a response can hold: pass `summary_output_path` and
read the file. Its captures keep 60–116 MB allocated until Studio restarts.

**`solo_playtest stop` can report a stop that did not happen.** Confirm with
`solo_playtest status` before measuring anything that assumes edit mode.

## What replication costs

Measured in a solo playtest, counting what the play server sent its client. These are Roblox's
rules, not any game's.

**How to measure it.** Scripts cannot: on the client `Stats.DataReceiveKbps` reads 0, and the
server's `Stats.DataSendKbps` read 1–2 kbps while the client received hundreds of KB/s. The OS
can: a playtest's server and client talk over a UDP pair on `127.0.0.1`. On macOS, the first
`udp4 127.0.0.1` line's `bytes_in` is what the server sent the client:

```bash
nettop -p $(pgrep -x RobloxStudio) -L 1 -J bytes_in,bytes_out -x | grep "udp4 127.0.0.1"
```

On Windows, Resource Monitor's Network tab shows the same pair per process. Take two readings a
few seconds apart and divide, one tool call after the other.

- **Changing one attribute resends all of them.** Sixteen anchored parts changing one number every
  frame cost 72 KB/s; the same parts carrying 20 attributes that never changed cost 536 KB/s for
  the same change. Keep per-frame values on their own small instance.
- **Only write a real change.** Float noise counts. A parked vehicle rewriting 12 attributes that
  jittered in the fourth decimal cost 33 KB/s standing still. Round, compare, skip.
- **Packing values into a string does not help.** Twelve values in one 24-byte string cost about
  300 bytes a change. Attribute strings are capped at 50 characters.
- **Each client has a send cap of roughly 450–550 KB/s.** Past it updates arrive late for
  everyone rather than failing.
- **A synced property write costs about 100 bytes.** Sixteen `VectorForce`s rewritten every frame
  cost 90–102 KB/s.
- **A moving body costs about 6 KB/s on its own**, with no property writes at all: the engine
  replicating each moving assembly. A body at rest, asleep, costs nothing.
- **Streaming trims distance** (with 160 vehicles on a 600-stud floor the client held 111), but
  inside one small arena everything is near everything.

**Under Server Authority:**

- **It is not free at rest.** A lone player standing still cost 22 KB/s down and 30 KB/s up with no
  RemoteEvent firing: the engine's sync of the predicted character.
- **Only the predicted model's own attributes are synced and rolled back.** State moved to a child
  instance was merely replicated, a few frames late: the client predicted from stale values and
  rolled back 27% of its steps. Keep simulation state on the model itself.
- **Drive a body with impulses.** `ApplyImpulse` / `ApplyAngularImpulse` inside
  `BindToSimulation` are not synced properties, and the engine replays them on rollback. A moving
  vehicle went from 14–18 KB/s to 6–7 KB/s moving from a rewritten force to impulses.
- **Counting rollbacks:** bind a counter with `RunService:BindToSimulation` on the client and count
  the steps where `RunService:IsResimulating()` is true. A rollback is a burst of about one round
  trip's worth of steps, so count bursts. They come in ones and twos even when nothing is wrong;
  compare over 20 seconds.

## What this cannot do

- **One machine's view.** `multiplayer_playtest` starts several clients in one Studio, but real
  latency, real devices and fairness between players stay human-tested.
- **No phone input.** `set_device_simulator` changes the viewport and input type; it is not a
  phone.
- **No taste.** An agent cannot judge colour, timing, or whether something reads at a glance.
  Bring those questions back to a person with a screenshot.
- **Studio Assistant's own libraries** (`require("@rbx/LibMP")` for the MicroProfiler) load only
  inside Assistant, not through this MCP. See [roblox-skills.md](roblox-skills.md).
