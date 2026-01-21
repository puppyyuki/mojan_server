const { TableEngineRegistry } = require('../../packages/engine');
const { createLegacySocketAdapter } = require('./legacySocketAdapter');

function attachTableServer(io, deps) {
  const registry = new TableEngineRegistry();
  const adapter = createLegacySocketAdapter({ io, registry, deps });
  adapter.attach();
  return { registry };
}

module.exports = { attachTableServer };

