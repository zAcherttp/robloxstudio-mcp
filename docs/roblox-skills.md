# Roblox skills for agents

Skills are Markdown playbooks an agent loads when a task matches. Three sources are worth knowing,
in order of trust. Checked 2026-09-24.

## 1. Roblox's own Studio Assistant skills (use these first)

Roblox writes these and ships them with Studio. `get_roblox_skills` reads them from your Studio
install, so they match the engine you are running:

```
get_roblox_skills  action: "list"
get_roblox_skills  action: "get", name: "rbx-input-action-system"
```

They are written for Studio's built-in Assistant and name its tools. Translate as you read:

| Skill says | Use with this MCP |
|---|---|
| `screen_capture` | `capture_screenshot` |
| `http_get` on create.roblox.com/docs | `get_roblox_docs` |
| `execute_luau` | `execute_luau` (same name; add `target` for a play peer) |
| start/stop play | `solo_playtest` / `multiplayer_playtest` |
| console output | `get_runtime_logs` |

| Skill | Reach for it when |
|---|---|
| `rbx-input-action-system` | any keyboard, mouse, gamepad or touch input; converting ContextActionService or UserInputService code. The default way to do input now. |
| `rbx-configs-experimentation` | a value you would hard-code or restart a server to change: prices, drop rates, feature flags, A/B tests (ConfigService) |
| `rbx-convert-to-streaming` | turning on StreamingEnabled, or fixing code that assumes everything is loaded |
| `rbx-debug` | a scripting bug static reading cannot explain: breakpoints and thread inspection (pairs with the `breakpoints` tool) |
| `rbx-unit-test`, `rbx-unit-test-testservice` | writing or running Luau unit tests for ModuleScripts. Not for playtesting or UI feel. |
| `rbx-virtual-input` | clicking buttons, typing, scrolling in a running game (pairs with `simulate_mouse_input` / `simulate_keyboard_input`) |
| `rbx-device-simulator-lua` | checking UI across phone, tablet and console form factors (pairs with `set_device_simulator`, `capture_device_matrix`) |
| `rbx-scene-analysis` | memory, rendering cost, instance counts, unparented instances (pairs with `get_scene_analysis`) |
| `rbx-luau-heap-profiling` | a Luau memory leak (pairs with `capture_heap_snapshot`, which does the capture for you) |
| `rbx-perf-profiling`, `rbx-perf-profiling-ref` | frame-time spikes. Its LibMP library loads only inside Assistant; here, use `capture_micro_profiler` with `summary_output_path` and `capture_script_profiler`. |
| `rbx-open-cloud-usage` | creating or managing developer products, badges, passes or data stores programmatically |
| `rbx-instrument-analytics` | adding Economy, Funnel and Custom analytics events |
| `rbx-process-receipt-misuse` | auditing developer-product purchase handling. Report-only by design. |
| `rbx-docs-search` | how Assistant looks up docs; here, `get_roblox_docs` does the same |
| `rbx-create-skill` | writing your own skill |

**What does not work through this MCP:** `require("@rbx/LibMP")` loads only inside Assistant.
`SceneAnalysisService:GetScriptMemoryAsync()` sat behind an engine flag that was off in
September 2026. `HeapProfilerService` needs the Plugin capability, which the eval tools lack; use
`capture_heap_snapshot`.

## 2. Community skill packs

None of these is official, and none knows this MCP's tool names. Read one before installing it:
a skill is instructions your agent will follow.

- **[gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)**
  (Apache-2.0, ~1,100 stars). Seven Roblox skills: luau, datastores, networking,
  studio-workflow, ui, physics, characters. In a spot-check against the docs it was accurate,
  points at official pages rather than hard-coding limits that drift, costs about 1,000 words a
  skill, and imposes no architecture. It predates the Input Action System, Server Authority and
  Transfers: pair it with Roblox's own skills and [agent-guide.md](agent-guide.md). **The one to
  start with.**
- **[MSayib/roblox-dev-skill](https://github.com/MSayib/roblox-dev-skill)** (MIT). Actively
  updated and covers recent APIs, but a spot-check of 21 claims found 10 wrong, including an
  invented Input Action System API and stale DataStore and MemoryStore limits. It prescribes
  "non-negotiable" project structure and ProfileStore, targets Roblox's official Studio MCP (its
  tool names do not exist here), and tells the agent to run a script that is not in its repo.
  **Not recommended as-is.** Its `studio-plugins-and-limits.md` reference is worth reading.
- **[brockmartin/roblox-game-skill](https://github.com/brockmartin/roblox-game-skill)**: popular
  but a single commit from March 2026, and no licence, so it cannot be reused.

## 3. Your own

The best skill for your game is the one your team writes from what it learned. Two cheap places
to start, neither of which needs a skill format:

- **`LESSONS.md`** at the project root: one `DOMAIN  what is true` line per trap, an indented
  `→ what to do instead` under it. `get_project_lessons` serves it alongside the engine lessons.
  Template: [workshop/templates/LESSONS.md](workshop/templates/LESSONS.md).
- **`CLAUDE.md`** (or `AGENTS.md`): how to build, run and verify *this* game. Template:
  [workshop/templates/CLAUDE.md](workshop/templates/CLAUDE.md).

When a lesson grows into a procedure (how we add a shop item, how we profile a level), that is
when it becomes a skill: a folder in `.claude/skills/<name>/SKILL.md` with a description saying
when to use it. `rbx-create-skill` walks through the format.
