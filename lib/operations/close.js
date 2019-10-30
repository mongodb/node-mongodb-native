'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const OperationBase = require('./operation').OperationBase;
const NativeTopology = require('../topologies/native_topology');

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

      if (!(client.topology instanceof NativeTopology)) {
        for (const item of client.s.dbCache) {
          item[1].emit('close', client);
        }
      }

      client.removeAllListeners('close');
      callback(err, null);
    };

    if (client.topology == null) {
      completeClose();
      return;
    }

    client.topology.close(force, err => {
      const autoEncrypter = client.topology.s.options.autoEncrypter;
      if (!autoEncrypter) {
        completeClose(err);
        return;
      }

      autoEncrypter.teardown(force, err2 => completeClose(err || err2));
    });
  }
}

defineAspects(CloseOperation, [Aspect.SKIP_SESSION]);

module.exports = CloseOperation;
