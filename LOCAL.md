# Local fork notes

Fork of [chrrxs/robloxstudio-mcp](https://github.com/chrrxs/robloxstudio-mcp) (MIT), kept so
upstream changes are reviewed and adopted deliberately rather than pulled automatically by
`npx @latest`. Forked at **v3.1.5**.

This fork carries **no source changes** yet. It exists for control over when upstream code runs,
not to fix a bug. Keep it that way if you can: an unmodified fork merges cleanly.

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
