const { createHash } = require('node:crypto');
const { join } = require('node:path');

// Synthetic peers must never inspect the developer's live Studio registry.
const suite = createHash('sha256').update(expect.getState().testPath).digest('hex');
process.env.ROBLOXSTUDIO_MCP_MANAGED_INSTANCE_REGISTRY_DIR = join(
  process.env.RSMCP_JEST_REGISTRY_ROOT, suite,
);
// Fork: nor write into the list of running servers (`npm run servers`).
process.env.ROBLOX_MCP_REGISTRY_DIR = join(process.env.RSMCP_JEST_REGISTRY_ROOT, suite, 'servers');
