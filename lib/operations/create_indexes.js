'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const MongoError = require('../core').MongoError;
const serverLacksFeature = require('../utils').serverLacksFeature;

class CreateIndexesOperation extends CommandOperationV2 {
  /**
   * @ignore
   */
  constructor(parent, name, indexSpecs, options, singular) {
    super(parent, options);
    this.name = name;
    this.indexSpecs = indexSpecs;
    this.singular = singular;
  }

  /**
   * @ignore
   */
  execute(server, callback) {
    const options = this.options;
    const indexSpecs = this.indexSpecs;

    const collationNotSupported = serverLacksFeature(server, 'collation');
    const commitQuorumNotSupported = serverLacksFeature(server, 'commitQuorum');

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexSpecs.length; i++) {
      // Did the user pass in a collation, check if our write server supports it
      if (indexSpecs[i].collation && collationNotSupported) {
        callback(new MongoError(collationNotSupported));
        return;
      }

      if (indexSpecs[i].name == null) {
        const keys = [];

        for (let name in indexSpecs[i].key) {
          keys.push(`${name}_${indexSpecs[i].key[name]}`);
        }

        // Set the name
        indexSpecs[i].name = keys.join('_');
      }
    }

    const cmd = {
      createIndexes: this.name,
      indexes: indexSpecs
    };

    if (options.commitQuorum != null) {
      // Ensure commitQuorum not passed if server < 4.4
      if (commitQuorumNotSupported) {
        return callback(new MongoError(commitQuorumNotSupported));
      }
      cmd.commitQuorum = options.commitQuorum;
    }

    super.executeCommand(server, cmd, (err, result) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, this.singular ? indexSpecs[0].name : result);
    });
  }
}

defineAspects(CreateIndexesOperation, [Aspect.WRITE_OPERATION, Aspect.EXECUTE_WITH_SELECTION]);

module.exports = CreateIndexesOperation;
