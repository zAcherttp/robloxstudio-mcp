# Local fork notes

Fork of [chrrxs/robloxstudio-mcp](https://github.com/chrrxs/robloxstudio-mcp) (MIT), kept so
upstream changes are reviewed and adopted deliberately rather than pulled automatically by
`npx @latest`. Forked at **v3.1.5**.

It exists for control over when upstream code runs. Keep local changes few and small: every one
is a conflict waiting at the next merge. What this fork carries on top of upstream:

- **`get_project_lessons`**: one-line Roblox engine traps shipped in the server
  (`packages/core/src/knowledge/engine-lessons.ts`, hand-maintained, nothing game- or
  framework-specific), plus the project's own `LESSONS.md` (or `docs/LESSONS.md`, or
  `ROBLOX_PROJECT_LESSONS`), read at call time from the directory the client launched the server
  in, which for Claude Code is the project. Replaced `get_core_lessons`, which vendored one
  framework's lessons into the build. Only `.md` files under 256 KB are read.
- **`capture_heap_snapshot`** (`packages/core/src/heap-snapshot.ts`): a Luau heap snapshot of a
  play server or client, written to a file, with a summary of what holds memory and, given an
  earlier file, what grew. It runs through `execute_luau`, which runs as the plugin: the eval
  tools lack the Plugin capability `HeapProfilerService` needs. The report stays on the peer and is
  read back in 200 KB chunks that end on UTF-8 boundaries. Category `write`, so the read-only
  Inspector cannot reach `execute_luau` through it; it raised the catalog budget test to 50 tools
  and 45,000 characters.
- **A build stamp** (`scripts/stamp-build.mjs`): `npm run build` and `npm run build:plugin` each
  record the commit they were built from (`+` for uncommitted changes) and when. The plugin panel's
  credit line shows the plugin's stamp and the server's side by side, amber when they differ. The
  server reads `build-info.json` (gitignored) at startup and sends it with its status. Touches the
  root `build` script, `build-plugin.mjs`, the status event and the panel's credit line.
- **A screencapture fallback for macOS host capture** (`packages/core/src/host-capture.ts`).
  Upstream's primary path is a ScreenCaptureKit helper compiled on first use with `xcrun swiftc`
  (about 25 seconds, once per server launch; then under a second a capture). It needs the Xcode
  command-line tools and macOS 14. Where it cannot be built or run, the fallback captures with
  `screencapture -l` under the helper's own rules: Screen Recording permission checked and never
  requested, exactly one Studio window matching the place title (it also skips Studio windows
  under 200 points, which the helper does not), and the same window identity. The helper's own
  refusals are never overridden. It began as this fork's own macOS capture, before upstream had
  one; merged with upstream's in September 2026.

- **`npm test` passes on macOS.** `tests/studio-test-snapshot.mjs` and
  `tests/studio-install-repair.mjs` resolve their temp directory (`/var` links to `/private/var`),
  and the snapshot test skips its case-collision case on a case-insensitive filesystem, where two
  such paths cannot exist.
- **CI** (`.github/workflows/ci.yml`): build, plugin build and `npm test` on Windows, macOS and
  Linux. Upstream has no CI; this is what makes "works on Windows" more than a reading of the code.
  It never starts Studio. Green on all three since `3d08ccc`, after four Windows fixes upstream
  never saw: the package-contents test spawned `npm.cmd` without a shell (refused since
  CVE-2024-27980); a PowerShell fixture compared a line that began with a byte-order mark; the
  snapshot and repair tests compared an 8.3 short temp path (`RUNNER~1`) with its long form; and
  the managed-instance registry lock failed outright on Windows' transient `EPERM`/`ENOENT`
  instead of retrying.
- **`.gitattributes`**: LF everywhere, so a Windows checkout builds and tests the same bytes.
- **Docs for a team:** a fork quickstart at the top of `README.md`, `docs/agent-guide.md`
  (driving Studio as an agent, game-agnostic), `docs/roblox-skills.md`, and `docs/workshop/`.

## How Claude Code runs it

`~/.local/bin/robloxstudio-mcp-local` sources `~/.zshrc.local` for
`ROBLOX_OPEN_CLOUD_API_KEY`, then execs `packages/robloxstudio-mcp/dist/index.js`. The wrapper
lives outside this repo on purpose, so upstream merges never touch it.

The MCP entry in `~/.claude.json` points at that wrapper and carries only
`ROBLOX_CREATOR_USER_ID`, which is not a secret. **The API key is not stored in `~/.claude.json`.**

The wrapper exists because Claude Code does not expand `${VAR}` in an MCP `env` block. An
unexpanded literal is a non-empty string, so it passes every "is a key configured?" check and
fails only at Roblox, as `Invalid or expired API key` — a misleading error that sends you to
rotate a perfectly good key. Sourcing the value at launch avoids the whole class of problem.

## After changing anything here

```bash
npm run build
```

Then restart the Claude Code session: an MCP server reads its environment and loads its code once,
at launch.

## Adopting upstream updates

Never fast-forward blindly — reviewing the diff is the entire point of the fork.

```bash
git fetch upstream
git log --oneline HEAD..upstream/main          # what changed
git diff HEAD..upstream/main --stat            # how much, and where
```

Read the diff with an eye on anything touching credentials, network destinations or new
dependencies:

```bash
git diff HEAD..upstream/main -- packages/core/src/opencloud-client.ts
git diff HEAD..upstream/main -- package.json packages/*/package.json
```

If it looks sound:

```bash
git merge upstream/main && npm install && npm run build && npm test
```

Then restart the session and confirm the Studio tools still respond before trusting it.

## Why this matters

The published package runs with the Open Cloud API key in its environment. The npm config it
replaced was `npx -y @chrrxs/robloxstudio-mcp@latest`, which fetches and executes whatever was
published most recently, unreviewed, on every launch. A single maintainer's compromised npm
account would have been enough. Nothing suggests that has happened — a scan of v3.1.5 found the
key going only to `apis.roblox.com` as `x-api-key`, and no telemetry — but `@latest` meant that
scan guaranteed nothing about tomorrow.

Upstream is active, so expect real changes when you fetch. Pin, read, merge, build, restart.
