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
    const mongocryptdClientClose = err => {
      const mongocryptdClient = client.s.mongocryptdClient;
      if (!mongocryptdClient) {
        completeClose(err);
        return;
      }

      mongocryptdClient.close(force, err2 => completeClose(err || err2));
    };

    if (client.topology == null) {
      mongocryptdClientClose();
      return;
    }

    client.topology.close(force, mongocryptdClientClose);
  }
}

defineAspects(CloseOperation, [Aspect.SKIP_SESSION]);

module.exports = CloseOperation;
