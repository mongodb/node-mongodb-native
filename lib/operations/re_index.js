'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const getTopologyType = require('../core/topologies/shared').getTopologyType;
const MongoError = require('../core').MongoError;
const ServerType = require('../core/sdam/common').ServerType;

class ReIndexOperation extends CommandOperationV2 {
  constructor(collection, options) {
    super(collection.s.db, options);
    this.collection = collection;
    this.command = { reIndex: collection.collectionName };
  }

  execute(server, callback) {
    if (getTopologyType(server) !== ServerType.Standalone) {
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
