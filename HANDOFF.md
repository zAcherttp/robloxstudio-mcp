# robloxstudio-mcp fork handoff

Status of this fork, newest on top. What the fork carries on top of upstream is in
[LOCAL.md](LOCAL.md); how to drive Studio is in [docs/agent-guide.md](docs/agent-guide.md).

## Picking up here (2026-10-06, Studio opens in the background and closes)

**`manage_instance` launches and closes Studio on macOS** (branch `feat/macos-studio-close`). Launch goes
through `open -g -n -a`, so Studio loads behind whatever you are doing; `close` force-quits a Studio
running a local place file after a 2 s grace and clears its `.lock`; a Studio not opened from a local
file is refused. Details and measurements in [LOCAL.md](LOCAL.md).

**Loaded:** nothing yet. Built and live-tested from the branch worktree only; the main checkout's
`dist` (what every session's server runs) still has the old launch and close until it is merged
and built, and each session's server restarted.

## Picking up here (2026-09-28, clicks land where the screenshot shows)

**Mouse x/y are screenshot pixels now** (`34d1ee3`). On a Retina Mac the CaptureService path
returned a 2118x1386 image of a 1059x693 viewport, while the virtual mouse takes viewport pixels,
so a click read off the image landed at twice its position. Every capture reports the viewport
size, `capture_screenshot` records the ratio per peer, and `simulate_mouse_input` and mouse steps
of `simulate_input_sequence` scale x/y by it and say by how much. Verified live in a playtest of
"globe tanks": a click read off the screenshot hit the button's centre, and clicks 8 px outside
and 5 px inside its edge landed as read. Without a screenshot of a peer, x/y stay viewport pixels.

**BillboardGui buttons take virtual clicks** (`5414b37`, docs only): in PlayerGui with `Adornee`
set and `Active` true they fire InputBegan and Activated; no layer-collector argument exists or is
needed. Parented in Workspace or with `Active` false they get nothing, as with a real mouse. A
billboard descendant's `AbsolutePosition` is billboard-local, and an `AlwaysOnTop` billboard is
missing from CaptureService screenshots; the agent guide's "Clicking" section has the details.

**Loaded:** both halves built at `34d1ee3`; Studio was quit and reopened, and the edit plugin
reports the viewport size. Rewriting the installed plugin file did not make Studio reload it.

**Open:**
- Other sessions' MCP servers were built before `34d1ee3` (`npm run servers` marks them STALE);
  each needs its own session to restart it.
- The agent guide's "Screenshots" section says captures go through the host OS; live, Studio's
  CaptureService answered and the host path is the fallback. Worth correcting.
