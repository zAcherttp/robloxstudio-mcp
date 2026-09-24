# Lessons

What this game learned the hard way, one line each. `get_project_lessons` serves this file next to
the engine lessons that ship with the Roblox Studio MCP, and reads it fresh on every call.

Format: a tag of 2–10 capital letters, two spaces, what is true; then an indented line with what to
do instead. A line earns its place by having cost someone time. Merely good advice belongs in a
code comment.

    NET       <e.g. Our round-state RemoteEvent fires before the client's UI exists>
              → <e.g. the client asks for the current state on start, then listens>

(Write yours without the leading indent; the indent keeps this example from being served.)

## Our game

<!-- Add lessons here. Group them under headings when there are enough to need it. -->
