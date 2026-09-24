# 2. First contact

Goal: watch the agent read a place, change it, playtest it and look at it, and learn what each
step is doing underneath. About 30 minutes. Use a fresh **Baseplate** so nothing matters.

Keep Studio and the terminal side by side. Every prompt below is something to type into
`claude`. Read the tool calls it makes, not just its answers: that is the skill this module
teaches.

## 2.1 Read

> Describe this place: what services have children, what is in Workspace, and whether there are
> any scripts.

Watch for `get_project_structure`, `search_objects`, `get_instance_properties`. These only read.

## 2.2 Build something in edit mode

> In Workspace, make a 10×1×10 anchored neon platform 20 studs above the spawn, and a Script that
> makes it slowly change colour through the rainbow. Keep the script short.

It will use `execute_luau` (Luau in the edit DataModel) or `manage_instance` plus
`set_script_source`. **Everything it does in edit mode is undoable with Ctrl/Cmd+Z in Studio.**

## 2.3 Playtest and read the logs

> Start a solo playtest. Check the output for errors, and tell me the platform's colour twice, a
> second apart, from the server. Then stop the playtest and confirm it stopped.

New tools: `solo_playtest` (start, status, stop), `get_runtime_logs`, `eval_server_runtime`.
Two colours that differ is proof the script runs; "the script should work" is not.

**Edit mode and play mode are different DataModels.** An `execute_luau` call without a `target`
cannot see the running game; the eval tools can.

## 2.4 Look at it

> Start a playtest again, frame the platform, and take a screenshot.

`selection` with `action: "view"` points the camera; `capture_screenshot` grabs the window
(macOS: this is where the Screen Recording permission from setup matters). Screenshots answer
"does it look right", not "is it correct".

## 2.5 Break it on purpose

> Change the script so it errors after 3 seconds. Playtest, find the error in the logs, fix it,
> and prove it is fixed.

This is the loop the rest of the day builds on: **change → run → read back → decide**.

## 2.6 What else is in the box

Ask Claude to list its `robloxstudio` tools. Worth knowing they exist:

| Tool | For |
|---|---|
| `multiplayer_playtest` | a server and several clients in one Studio |
| `simulate_keyboard_input`, `simulate_mouse_input` | pressing keys and clicking in a running game |
| `set_device_simulator`, `capture_device_matrix` | UI on phone, tablet and console layouts |
| `get_runtime_logs` | output from edit, server or a specific client |
| `breakpoints` | record hits without pausing |
| `capture_script_profiler`, `capture_micro_profiler`, `get_memory_breakdown`, `capture_heap_snapshot` | where time and memory go |
| `search_assets`, `preview_asset`, `insert_asset` | Creator Store, with scripts stripped on insert |
| `get_roblox_docs`, `get_roblox_skills` | official API pages and Roblox's own skills |
| `get_project_lessons` | engine traps, plus your project's `LESSONS.md` (module 4) |

The agent also reads `robloxstudio://tool-guides`, a workflow guide the server ships.

## If it goes wrong

| Symptom | Fix |
|---|---|
| "No Studio instance connected" | Plugin panel not **Connected**; see module 1. |
| An eval call times out at ~30 s | Long work: ask the agent to `task.spawn` it and poll `_G`. |
| The playtest keeps running after "stopped" | Ask for `solo_playtest status`; stop again. It has happened. |
| Two Studio windows, the agent picks the wrong one | Close one, or tell it which `instance_id` from `get_connected_instances`. |
