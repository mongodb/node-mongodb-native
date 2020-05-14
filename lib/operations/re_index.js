'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const topologyType = require('../core/topologies/shared').topologyType;
const TopologyType = require('../core/sdam/common').TopologyType;
const ServerType = require('../core/sdam/common').ServerType;
const MongoError = require('../core').MongoError;

class ReIndexOperation extends CommandOperationV2 {
  constructor(collection, options) {
    super(collection.s.db, options);
    this.collection = collection;
    this.command = { reIndex: collection.collectionName };
  }

  execute(server, callback) {
    const type = topologyType(server);
    if (!(type === TopologyType.Single || type === ServerType.Standalone)) {
      callback(new MongoError(`reIndex can only be executed on standalone servers.`));
      return;
    }
    super.executeCommand(server, this.command, (err, result) => {
      if (err) {
        callback(err);
        return;
      }
      callback(null, !!result.ok);
    });
  }
}

defineAspects(ReIndexOperation, [Aspect.EXECUTE_WITH_SELECTION]);

module.exports = ReIndexOperation;
