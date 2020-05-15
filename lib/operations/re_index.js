'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const serverType = require('../core/sdam/common').serverType;
const ServerType = require('../core/sdam/common').ServerType;
const MongoError = require('../core').MongoError;

class ReIndexOperation extends CommandOperationV2 {
  constructor(collection, options) {
    super(collection, options);
    this.collectionName = collection.collectionName;
  }

  execute(server, callback) {
    if (serverType(server) !== ServerType.Standalone) {
      callback(new MongoError(`reIndex can only be executed on standalone servers.`));
      return;
    }
    super.executeCommand(server, { reIndex: this.collectionName }, (err, result) => {
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
