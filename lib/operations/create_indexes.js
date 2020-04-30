'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const MongoError = require('../core').MongoError;
const maxWireVersion = require('../core/utils').maxWireVersion;

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

    const serverWireVersion = maxWireVersion(server);
    const collationNotSupported =
      serverWireVersion < 5
        ? `Server ${server.name}, which reports wire version ${serverWireVersion}, does not support collation`
        : false;

    // Ensure we generate the correct name if the parameter is not set
    for (let i = 0; i < indexSpecs.length; i++) {
      if (indexSpecs[i].name == null) {
        const keys = [];

        // Did the user pass in a collation, check if our write server supports it
        if (indexSpecs[i].collation && collationNotSupported) {
          callback(new MongoError(collationNotSupported));
          return;
        }

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
      if (maxWireVersion(server) < 9) {
        return callback(
          MongoError.create({
            message: '`commitQuorum` option for `createIndexes` not supported on servers < 4.4',
            driver: true
          })
        );
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
