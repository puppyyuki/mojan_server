const { TableEngine } = require('./tableEngine');

class TableEngineRegistry {
  constructor() {
    this.byTableId = new Map();
  }

  getOrCreate(tableId, ctx) {
    const existing = this.byTableId.get(tableId);
    if (existing) return existing;

    const engine = new TableEngine(tableId, ctx);
    this.byTableId.set(tableId, engine);
    return engine;
  }
}

module.exports = { TableEngineRegistry };

