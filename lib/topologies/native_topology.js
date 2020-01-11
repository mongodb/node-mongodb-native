'use strict';

const Topology = require('../core').Topology;
const ServerCapabilities = require('./topology_base').ServerCapabilities;
const Cursor = require('../cursor');
const translateOptions = require('../utils').translateOptions;

class NativeTopology extends Topology {
  constructor(servers, options) {
    options = options || {};

    let clonedOptions = Object.assign(
      {},
      {
        cursorFactory: Cursor,
        reconnect: false,
        emitError: typeof options.emitError === 'boolean' ? options.emitError : true,
        maxPoolSize: typeof options.poolSize === 'number' ? options.poolSize : 5,
        minPoolSize: typeof options.minSize === 'number' ? options.minSize : 0,
        monitorCommands:
          typeof options.monitorCommands === 'boolean' ? options.monitorCommands : false
      }
    );

    // Translate any SSL options and other connectivity options
    clonedOptions = translateOptions(clonedOptions, options);

    // Socket options
    var socketOptions =
      options.socketOptions && Object.keys(options.socketOptions).length > 0
        ? options.socketOptions
        : options;

    // Translate all the options to the core types
    clonedOptions = translateOptions(clonedOptions, socketOptions);

    super(servers, clonedOptions);
  }

  capabilities() {
    if (this.s.sCapabilities) return this.s.sCapabilities;
    if (this.lastIsMaster() == null) return null;
    this.s.sCapabilities = new ServerCapabilities(this.lastIsMaster());
    return this.s.sCapabilities;
  }

  // Command
  command(ns, cmd, options, callback) {
    super.command(ns.toString(), cmd, options, callback);
  }

  // Insert
  insert(ns, ops, options, callback) {
    super.insert(ns.toString(), ops, options, callback);
  }

  // Update
  update(ns, ops, options, callback) {
    super.update(ns.toString(), ops, options, callback);
  }

  // Remove
  remove(ns, ops, options, callback) {
    super.remove(ns.toString(), ops, options, callback);
  }
}

module.exports = NativeTopology;
