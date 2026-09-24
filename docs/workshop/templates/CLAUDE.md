# <Game name>

<Two sentences: what the player does, and what makes it this game.>

## How code reaches Studio

<One of:>
- Scripts are edited in Studio directly; the place file is the source of truth.
- Studio Script Sync mirrors `<folder>` to `<Explorer path>`.
- Rojo: `rojo serve` (port <34872>) from `default.project.json`. A project-file change needs
  `rojo serve` restarted and the plugin reconnected.

## Layout

<Only what an agent cannot guess from the tree. For example:>
- Server code: `<path>`. Client code: `<path>`. Shared modules: `<path>`.
- Tunable numbers live in `<path>`, not in scripts.

## Driving the game without clicking

Every gameplay feature has a Studio-only entry point that calls the same server code as player
input. They live in `<path>` and are reached with:

```lua
-- from eval_server_runtime
return _G.Debug.<feature>(game.Players:GetPlayers()[1])
```

A new feature is not done until it has one, and a way to read its result back.

## Verifying a change

- Start with `get_project_lessons` (engine traps plus our `LESSONS.md`).
- A change is verified by a value read back from a playtest, not by reading the code.
- Drive characters from the server (`eval_server_runtime`), sample on the client
  (`eval_client_runtime`).
- Confirm `solo_playtest status` after stopping.
- Tests: <how to run them, if you have any>.

## Never

- Push to `main`, merge a pull request, or approve one. Work on a branch, open a pull request with
  `Closes #<issue>`, and let a person review and merge.
- Publish the place, or change live DataStores, Open Cloud resources or monetization settings.
- Commit secrets. <Where keys live instead.>
- <Anything else this team has been burned by.>

## When something costs time

Add one line to `LESSONS.md`: `DOMAIN  what is true`, then `→ what to do instead` under it.
