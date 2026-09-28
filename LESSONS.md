# Lessons

What this fork learned the hard way, one lesson each: a tagged line, and at most one line under it.
Append only. A line earns its place by having cost a session; what LOCAL.md or docs/ already say
stays there.

Format: `DOMAIN  what is true → what to do instead`.

```
WORKSHOP  The workshop artifact is owned by Phát's school Claude account, not the work one
          → republish workshop.html to the existing URL from the school account, never as a new artifact
WINDOWS   CI is green on Windows, but nobody has driven a live Studio on Windows with this fork
          → don't claim Windows works end to end until a teammate has run it
PLUGIN    A plugin change loads only when the Studio app itself is quit and reopened (StudioMCP restarting is not Studio)
          → after build:plugin, check the RobloxStudio process start time is after the install before testing
PLUGIN    Correction to the line above: Studio did reload the changed plugin file on its own twice the same day, once it did not
          → after build:plugin, test something only the new plugin does; quit Studio only if it is still old
SERVER    Killing this session's MCP server process makes Claude Code start a fresh one on the next tool call
          → to load a server change without restarting Claude Code, kill only the node process whose parent is this session's
```
