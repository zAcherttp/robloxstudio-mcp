# 1. Setup

Goal: Claude Code running, this MCP built from source, and the Studio plugin showing
**Connected**. About 40 minutes, most of it downloads.

Why from source: the npm package `@chrrxs/robloxstudio-mcp` is upstream's build, not this fork,
and `npx ...@latest` runs whatever was published most recently on every launch. Building from a
clone means you run code you can read, and you update when you choose.

## 1.1 Install Claude Code

macOS or Linux:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://claude.ai/install.ps1 | iex
```

Then run `claude` once in a terminal and sign in. The Claude desktop app's **Code** tab works
too and uses the same MCP configuration.

## 1.2 Build the MCP

Pick a folder for tools (below, `~/dev`; on Windows, `C:\dev` is fine).

```bash
cd ~/dev
git clone https://github.com/zAcherttp/robloxstudio-mcp.git
cd robloxstudio-mcp
npm install
npm install --prefix studio-plugin
npm run build
npm run build:plugin
```

- `npm run build` builds the server into `packages/robloxstudio-mcp/dist/`.
- `npm run build:plugin` builds `studio-plugin/MCPPlugin.rbxmx` **and copies it into Studio's
  Plugins folder** (`~/Documents/Roblox/Plugins` on macOS, `%LOCALAPPDATA%\Roblox\Plugins` on
  Windows). Set `MCP_PLUGINS_DIR` first if yours is elsewhere.

Optional but worth 30 seconds: `npm test` should end green. It never starts Studio.

## 1.3 Register it with Claude Code

Use the **absolute** path to your clone. `--scope user` makes it available in every project.

macOS or Linux:

```bash
claude mcp add robloxstudio --scope user -- node ~/dev/robloxstudio-mcp/packages/robloxstudio-mcp/dist/index.js --auto-install-plugin
```

Windows (PowerShell; forward slashes are fine):

```powershell
claude mcp add robloxstudio --scope user -- node C:/dev/robloxstudio-mcp/packages/robloxstudio-mcp/dist/index.js --auto-install-plugin
```

`--auto-install-plugin` re-copies your locally built plugin into Studio when it is missing or
older. It never downloads anything.

Check: `claude mcp list` shows `robloxstudio`.

## 1.4 Studio

1. **Fully quit and reopen Studio** (a plugin is loaded only at start).
2. Open any place: a Baseplate is fine.
3. **Plugins** tab → **MCP Server**. The panel should say **Connected** once Claude Code is
   running in a terminal.
4. If Studio asks whether the plugin may make HTTP requests to `localhost` or inject scripts,
   allow it: that is how it talks to the server and runs Luau.

The panel's bottom line shows two build stamps, the plugin's and the server's (a commit and a
time). **Amber means they differ**: rebuild both and restart.

Place settings you may need later, not now:

- **Game Settings → Security → Allow Loading Third Party Assets**, to preview or insert Creator
  Store assets you do not own.
- **Game Settings → Security → Allow HTTP Requests** (`HttpEnabled`). Not needed for the MCP to
  connect in edit mode; turn it on if play-session tools do not connect.

## 1.5 macOS only: screenshots

`capture_screenshot` needs **Screen Recording** permission for the app that launched the MCP
server: your terminal (Terminal, iTerm, Ghostty…) or the Claude desktop app. **System Settings →
Privacy & Security → Screen & System Audio Recording**, add it, then restart that app. The
first screenshot after each start takes about 25 seconds; later ones under a second.

## Check it works

In a terminal, in any folder:

```bash
claude
```

Then ask:

> Which Roblox Studio instances are connected? Then tell me the name of the place and how many
> parts are in Workspace.

You should see it call `get_connected_instances` and `execute_luau` or `get_place_info`, and
answer with your place's real numbers.

## If it goes wrong

| Symptom | Fix |
|---|---|
| `claude mcp list` shows the server failed | Run the `node .../dist/index.js` command yourself; the error is printed. Usually a wrong path or `npm run build` not run. |
| No **MCP Server** button in Studio | Studio was not fully restarted, or the plugin went to a different folder: check `MCP_PLUGINS_DIR`, or copy `studio-plugin/MCPPlugin.rbxmx` into **Plugins → Plugins Folder** by hand. |
| Panel says **Disconnected** | Normal until Claude Code is running. Start `claude`, then wait a few seconds. |
| Stamps amber | Rebuild both: `npm run build && npm run build:plugin`, restart Studio and Claude Code. |
| Two MCP plugins in the Plugins folder | Keep only `MCPPlugin.rbxmx`; delete `MCPInspectorPlugin.rbxmx`. |
| Screenshot says permission missing (macOS) | See 1.5; restart the app you granted it to. |
| Port 58741 in use | Another server already owns it; later sessions proxy through the first, which is fine. To move it, see `ROBLOX_STUDIO_PORT` in [configuration.md](../configuration.md). |

## Updating later

```bash
cd ~/dev/robloxstudio-mcp
git pull
npm install && npm run build && npm run build:plugin
```

Then restart Studio and your Claude Code session: a server loads its code once, at launch.
