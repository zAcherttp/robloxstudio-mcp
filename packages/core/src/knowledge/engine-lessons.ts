// Roblox engine traps that cost a session to find, one line each, served by get_project_lessons
// alongside a project's own LESSONS.md. Hand-maintained: a line belongs here only if it is true
// of any game on this engine, whatever its framework. Game- or framework-specific lessons belong
// in that project's LESSONS.md, which the tool reads from the project at call time.
//
// Format: `DOMAIN  what is true`, then an indented `→ what to do instead`. The long form of most
// of these, with the measurements behind them, is docs/agent-guide.md.
//
// Last checked against Studio 2026-09-24.

export const ENGINE_LESSONS = `# Engine lessons

Roblox traps that cost a session to find. Each is true of any game, whatever its framework.
Format: \`DOMAIN  what is true → what to do instead\`. Long form: docs/agent-guide.md in robloxstudio-mcp.

## Properties the engine owns

PROPERTY  Motor6D.Transform is rewritten by the Animator on every joint, animated or not
          → drive a custom joint through C0
PROPERTY  AnimationConstraint.Transform likewise; a 60° drive measured 1.7°
          → publish an animation asset and play it
PROPERTY  LocalTransparencyModifier is reset on a part as it joins a character; it holds on one
          that has been there a while, which is why it tests as working
          → write Transparency
PROPERTY  A Highlight with Adornee = nil outlines its Parent; parented to Workspace, clearing
          the Adornee outlines the whole world
          → toggle Enabled; never clear Adornee to hide it
PROPERTY  Before building on a property write, check it holds
          → write, wait a frame, read back; anything that reverted is owned by the engine

## Characters, input and rigs

INPUT     Humanoid.MoveDirection is read-only and the control script calls Move every frame
          → drive the character from the server, sample on the client
INPUT     The default PlayerModule runs from StarterPlayer and returns no GetControls; movement
          goes through the Input Action System
          → read StarterPlayer.PlayerModule.InputContexts.CharacterContext.MoveAction:GetState()
RIG       Avatars join with AnimationConstraint (plus a BallSocketConstraint), not Motor6D;
          code that walks Motor6Ds finds nothing, and posing arms from the server does nothing
          → weld what you attach; animate with published assets played on the client's Animator
RIG       KeyframeSequence.Priority is lost on RegisterKeyframeSequence
          → set track.Priority after LoadAnimation
IMPORT    The 3D Importer turns FBX meshes half round about Y and reads centimetres as studs
          → turn imported meshes back by 180° and set sizes from your own layout
UPLOAD    Open Cloud rejects .rbxm animations sent as application/octet-stream
          → model/x-rbxm

## Studio and the edit session

STUDIO    require is cached per ModuleScript and Rojo rewrites Source in place; restarting
          Studio does not clear it, so a result can be about code you already deleted
          → require a Clone of the module (and of anything the test requires); check .Source
            for a string you just wrote before believing any result
STUDIO    A Rojo project file change needs \`rojo serve\` restarted and the plugin reconnected;
          renaming a mount leaves the old instances behind, running a second copy
          → restart after project changes; delete old instances by hand after a rename
STUDIO    The playtest an agent drives is the one the person is watching; a probe that anchors
          or moves their character and does not undo it reads as a broken game
          → undo every change before the eval returns, error path included
STUDIO    A long eval_server_runtime / eval_client_runtime call times out at about 30 s and keeps
          running with its result lost
          → task.spawn the work, write results into _G, poll with short calls
STUDIO    solo_playtest stop has reported success while the session ran on
          → confirm with solo_playtest status before measuring edit-only state
STUDIO    Every plugin runs in the edit, server and client DataModels during a playtest, so its
          per-frame cost is paid three times
          → keep the plugin set small; profile with plugins you actually need
STUDIO    HeapProfilerService needs the Plugin capability; the eval tools lack it
          → use capture_heap_snapshot, or execute_luau with target "server" / "client-N"

## Luau

LUAU      A table key past ~2^24 leaves the array part for the hash part; ids built as
          slot + generation * stride cross that line once anything recycles
          → key hot tables by the dense small int; benchmark a recycled world, not a fresh one

## Replication

NET       Changing one attribute resends every attribute on that instance
          → keep per-frame values on their own small instance, away from settings
NET       Float noise counts as a change: a parked body rewriting jittering values cost 33 KB/s
          → round, compare, and skip the write when nothing moved
NET       Packing values into one attribute string costs more per change than plain numbers,
          and attribute strings are capped at 50 characters
NET       A synced property write (a VectorForce rewritten each step, say) costs ~100 bytes
          → drive bodies with ApplyImpulse inside BindToSimulation; hold weight with one steady force
NET       A moving assembly costs ~6 KB/s to replicate on its own; a sleeping one costs nothing
          → let bodies at rest sleep
NET       Each client has a send cap of roughly 450–550 KB/s; past it updates arrive late for
          everyone rather than failing
NET       Under Server Authority only the predicted model's own attributes are synced and rolled
          back; a child instance's attributes are merely replicated, late
          → keep simulation state on the predicted model itself
NET       Anything both sides can derive from the same inputs should not be sent
          → send the owner and the slot, derive the seed
NET       Scripts cannot measure replication: Stats.DataReceiveKbps reads 0 on the client
          → count the playtest's localhost UDP pair from the OS (nettop on macOS)
CLIENT    A client may move an anchored part the server owns and it stays moved, because the
          server never corrects a part it is not moving
          → write rest * offset from a stored rest, never step from the current value

## Physics

PHYSICS   Gravity is integrated over substeps; an impulse at the frame's start balances it only at
          frame boundaries, so a body can creep while every sampled velocity reads 0
          → hold weight with a steady VectorForce; kick in only what is left

## Measuring

MEASURE   A settling value sampled too early is indistinguishable from permanent drift
          → compare against the server's own value, and sample twice seconds apart
MEASURE   A harness that holds a movement key for seconds measures the harness, not the feature
          → measure one action
MEASURE   Identical numbers from two different inputs mean the input never landed
MEASURE   A mechanism asserted from one case is a guess
          → test the case it is supposed to explain, not a nearby one
MEASURE   A saved or replicated key that is written and never read leaves no trace at runtime
          → search for its readers after adding one
`;

export const ENGINE_LESSON_COUNT = ENGINE_LESSONS.split('\n').filter((line) => /^[A-Z]{2,10} {2}/.test(line)).length;
