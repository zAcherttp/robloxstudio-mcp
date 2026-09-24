# 5. Windows check

This fork is developed on macOS. Upstream was built Windows-first and its Windows code is
unchanged here, and CI builds and runs the offline tests on Windows, but **nobody has run this
fork against a live Studio on Windows yet**. Ten minutes from one Windows teammate settles it.

Open a "Windows check" issue on your team's issue board, paste the list below with what worked
ticked, and paste the error for anything that did not. (The workshop page's **Open as an issue**
button does this for you.)

```
Windows version:
Node version (node -v):
Studio version (Help → About, or the title bar):
Fork commit (git rev-parse --short HEAD):

Build
[ ] npm install
[ ] npm install --prefix studio-plugin
[ ] npm run build      (build-info.json appears at the repo root)
[ ] npm run build:plugin   (MCPPlugin.rbxmx lands in %LOCALAPPDATA%\Roblox\Plugins)
[ ] npm test           (ends without a failure)

Connect
[ ] claude mcp list shows robloxstudio as connected
[ ] Studio's MCP Server panel says Connected
[ ] The two build stamps on the panel match (not amber)

Tools (ask Claude to do each)
[ ] get_connected_instances lists this Studio
[ ] execute_luau returns a value in edit mode
[ ] solo_playtest start, status, stop
[ ] eval_server_runtime and eval_client_runtime return values during a playtest
[ ] get_runtime_logs shows server output
[ ] capture_screenshot in edit mode
[ ] capture_screenshot during a playtest
[ ] capture_heap_snapshot target "server" writes a file and returns a summary
[ ] get_project_lessons returns engine lessons (and your LESSONS.md, if you made one)
[ ] manage_instance can list, launch and close Studio   (optional)

Anything odd:
```

Deeper checks, for whoever wants them (need a built `packages/core`):

```powershell
cd packages/core
npx jest studio-process-enumeration    # the 4 native PowerShell tests run here, not on macOS
cd ../..
node tests/windows-capture-helper.mjs
```
