'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const OperationBase = require('./operation').OperationBase;

class CloseOperation extends OperationBase {
  constructor(client, force) {
    super();
    this.client = client;
    this.force = force;
  }

  execute(callback) {
    const client = this.client;
    const force = this.force;
    const completeClose = err => {
      client.emit('close', client);
      for (const name in client.s.dbCache) {
        client.s.dbCache[name].emit('close', client);
      }

      client.removeAllListeners('close');
      callback(err, null);
    };

    if (client.topology == null) {
      completeClose();
      return;
    }

    client.topology.close(force, completeClose);
  }
}

defineAspects(CloseOperation, [Aspect.SKIP_SESSION]);

module.exports = CloseOperation;
