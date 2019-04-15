'use strict';

const Topology = require('mongodb-core').Topology;
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
        size: typeof options.poolSize === 'number' ? options.poolSize : 5,
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

    // Translate all the options to the mongodb-core ones
    clonedOptions = translateOptions(clonedOptions, socketOptions);

    super(servers, clonedOptions);

    // Do we have an application specific string
    if (options.appname) {
      this.s.clientInfo.application = { name: options.appname };
    }
  }

  capabilities() {
    if (this.s.sCapabilities) return this.s.sCapabilities;
    if (this.lastIsMaster() == null) return null;
    this.s.sCapabilities = new ServerCapabilities(this.lastIsMaster());
    return this.s.sCapabilities;
  }
}

module.exports = NativeTopology;
