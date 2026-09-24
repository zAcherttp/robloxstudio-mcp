# 4. Your own game

Goal: a repository for a game of your own that an agent can work in from the first prompt, and one
small feature built end to end. About 40 minutes. Work in pairs if you like.

**You choose the architecture.** Nothing here prescribes folders, frameworks or libraries. What
makes an agent effective is not a framework; it is knowing how to build, run and check *your*
game. Two files carry that.

## 4.1 Start the repo

Pick how code reaches Studio. All three work with the MCP:

| Choice | When |
|---|---|
| **Edit in Studio** (the agent uses `set_script_source` / `edit_script_lines`) | Fastest start. Scripts live in the place file; no git history of code. |
| **Studio Script Sync** (right-click in Explorer → sync to a folder) | Scripts become files on disk that git can track, with no extra tools. |
| **Rojo** (`rojo init`, `rojo serve`) | The whole tree from files; best for a team with code review. |

```bash
mkdir my-game && cd my-game
git init
```

## 4.2 `CLAUDE.md`: how this game is built, run and checked

Claude Code reads `CLAUDE.md` at the project root at the start of every session. Copy
[templates/CLAUDE.md](templates/CLAUDE.md) and fill in the blanks. Keep it short: every line is
read every session. It should answer:

- What is this game, in two sentences?
- How does code get into Studio (edit in place, Script Sync, Rojo and on which port)?
- How does the agent drive a feature without clicking (your debug entry points)?
- How is a change verified? "Readback from a playtest" beats "it compiles".
- What must it never do (publish, touch DataStores outside Studio, ...)?

## 4.3 `LESSONS.md`: what cost you time

Copy [templates/LESSONS.md](templates/LESSONS.md). It starts almost empty. Every time the agent
(or you) loses half an hour to something, add one line:

```
DOMAIN    what is true
          → what to do instead
```

`get_project_lessons` serves this file next to the engine lessons that ship with the MCP, reading
it fresh each call, so a lesson written now is in the next prompt. It looks for `LESSONS.md` or
`docs/LESSONS.md` in the folder you started `claude` in.

## 4.4 Build one feature, end to end

Something small with a rule you can check. Examples: a coin that adds to a leaderstat, a door
that opens for players on a team, a timer that ends a round.

> Read CLAUDE.md and call get_project_lessons. Then build [feature]. Give it a Studio-only
> debug entry point that calls the same server code as player input. Playtest it, read the
> result back, and show me the numbers.

Then review what it did: the diff, the readback, a screenshot. If something cost time, add the
lesson.

## 4.5 Skills

When you need depth on one topic (input, streaming, analytics, purchases), there are skills
for it. Start with Roblox's own: `get_roblox_skills` lists them.
[roblox-skills.md](../roblox-skills.md) says which to use when, and which community packs are
worth trusting (one is, one is not).

## 4.6 Habits that pay

- **One task per session.** Start a fresh `claude` for an unrelated task; context is finite.
- **Ask for the plan first** on anything bigger than a function ("plan it, don't write code yet").
- **Commit before a big change**, so "undo" is `git checkout`, not hope.
- **Say what "done" means**: the number you want to see, the screenshot you want to look at.
- **Never paste secrets** (Open Cloud keys, cookies) into a prompt or into `CLAUDE.md`.
