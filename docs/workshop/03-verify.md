# 3. Trust, but verify

Goal: make "show me the number" a reflex. An agent that says "done" has told you what it
believes. An agent that reads a value back from the running game has told you what is true.
About 30 minutes.

Reference for this module: [agent-guide.md](../agent-guide.md). Hand it to the agent too:

> Read docs/agent-guide.md from the robloxstudio-mcp repo (or call get_project_lessons) before
> we start.

## 3.1 Claims versus readbacks

Ask for a feature, then ask how it knows:

> Add a part that launches a player upward when they touch it. Then prove it works without me
> playing.

A good answer drives the game itself: it starts a playtest, moves the character onto the pad
**from the server** (`eval_server_runtime`), and reads the character's height back on the client
(`eval_client_runtime`), several times, and reports the peak. A weak answer describes the code.

If it tries to walk the character from the client, it will see nothing happen: the control
script rewrites `Humanoid.MoveDirection` every frame. That is the first trap in the guide.

## 3.2 Arm, trigger, read

A launch is over in half a second, so a single read after the fact misses it. The pattern:

1. **Arm** a sampler on the client that records the peak into `_G`.
2. **Trigger** from the server.
3. **Read** the peak back from the client.

> Measure the launch pad's peak height with an arm–trigger–read probe, three times.

Three numbers that roughly agree are a measurement. One number is an anecdote. Three identical
numbers to the decimal usually mean the trigger never landed.

## 3.3 Give features a way in

The cheapest thing you can do for an agent is give each gameplay feature a way to be driven
**without clicking**: a debug command, a BindableFunction, a module function the server exposes in
Studio only. It must call **the same server code as player input**, or you are testing something
players never run.

This is not a framework. It is one function per feature:

```lua
-- ServerScriptService/DebugCommands (only in Studio)
if not game:GetService("RunService"):IsStudio() then return end
_G.Debug = {
	launch = function(player) return LaunchPad.launch(player.Character) end, -- the same call the Touched handler makes
}
```

> Add a Studio-only debug entry point for the launch pad that calls the same function the touch
> handler does, and use it to test the pad.

## 3.4 Traps worth knowing by name

Ask the agent for these; it should find them in `get_project_lessons`:

- A write to a property the engine owns reverts within a frame (`Motor6D.Transform`,
  `LocalTransparencyModifier`, ...). Write, wait a frame, read back.
- Studio caches `require`: an edited ModuleScript can keep returning its old table even after a
  Studio restart. Require a clone.
- A long eval times out at ~30 s and keeps running with its result lost.
- `solo_playtest stop` has reported success while the session kept running.
- Changing one attribute resends every attribute on that instance.

## 3.5 Know what it cannot judge

An agent cannot tell you whether something feels good, reads at a glance, or looks right on a
phone in someone's hand. It can bring you a screenshot and numbers; the call is yours. Real
multiplayer (latency, fairness) and real devices stay human-tested.
