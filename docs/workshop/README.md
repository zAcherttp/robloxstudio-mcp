# Workshop: Claude Code + Roblox Studio

A hands-on session for a Roblox team. By the end, everyone has Claude Code driving their own
Roblox Studio through this MCP, has watched it build, playtest and check something, and has
started a repository for their own game with the two files that make an agent useful there.

The same workshop as one page, with an English/Vietnamese switch and pre-filled issue links, is
[workshop.html](workshop.html), published as a Claude Artifact for the session.

**No framework is required or taught.** Structure your game however your team likes; this
workshop is about the loop between you, the agent and Studio, not about any codebase.

## Agenda (about 2½ hours)

| # | Module | Time | You leave with |
|---|---|---|---|
| 1 | [Setup](01-setup.md) | 40 min | Claude Code installed, the MCP built, Studio showing **Connected** |
| 2 | [First contact](02-first-contact.md) | 30 min | The agent reading, editing and playtesting a place while you watch |
| 3 | [Trust, but verify](03-verify.md) | 30 min | The habit of asking for a number read back, not a claim |
| 4 | [Your own game](04-your-game.md) | 40 min | A repo with `CLAUDE.md` and `LESSONS.md`, and a first feature built |
| 5 | [Windows check](05-windows-check.md) | 10 min, Windows only | A short report that tells us the Windows path works |

**Blocked at any point?** Open an issue on your team's issue board: which module, what you saw, what you tried. The workshop page's **Blocked?** section fills one in for you.

Take a break between 2 and 3.

## Before the day

Each person needs:

- **Roblox Studio**, signed in, opened at least once.
- **Node.js 22 or newer** ([nodejs.org](https://nodejs.org), LTS).
- **git**.
- **A Claude account with Claude Code access** (a Pro, Max, Team or Enterprise plan, or an API
  key).
- On **macOS**: the Xcode command-line tools (`xcode-select --install`), for fast screenshots.
- Optional: **Rojo**, if your team syncs code from files. Not needed for the workshop.

## For the facilitator

- Run module 1 yourself on a clean machine the day before. Setup is where time goes.
- Have one place ready to share: a Baseplate with a few parts is enough. Nothing game-specific.
- Keep the MCP's reference pages open: [agent-guide.md](../agent-guide.md) (what the agent
  should know about Studio) and [roblox-skills.md](../roblox-skills.md) (which skills to trust).
- Pick one issue board for the team and make sure everyone can open issues on it. Blockers and the
  Windows reports from module 5 go there, one issue per problem. The fork also carries **Workshop
  blocker** and **Windows check** issue forms (`.github/ISSUE_TEMPLATE/`) to copy into that repo.
- Things people will hit, and the fix, are in each module's **If it goes wrong** section.
