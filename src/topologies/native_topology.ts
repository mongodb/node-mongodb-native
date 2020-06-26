'use strict';
import { Topology } from '../sdam/topology';
import { ServerCapabilities } from './topology_base';
import { Cursor } from '../cursor';
import { translateOptions } from '../utils';

class NativeTopology extends Topology {
  s: any

  constructor(servers: any, options: any) {
    options = options || {};

    let clonedOptions = Object.assign(
      {},
      {
        cursorFactory: Cursor,
        reconnect: false,
        emitError: typeof options.emitError === 'boolean' ? options.emitError : true,
        maxPoolSize:
          typeof options.maxPoolSize === 'number'
            ? options.maxPoolSize
            : typeof options.poolSize === 'number'
            ? options.poolSize
            : 10,
        minPoolSize:
          typeof options.minPoolSize === 'number'
            ? options.minPoolSize
            : typeof options.minSize === 'number'
            ? options.minSize
            : 0,
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
  command(ns: any, cmd: any, options: any, callback: Function) {
    super.command(ns.toString(), cmd, options, callback);
  }

  // Insert
  insert(ns: any, ops: any, options: any, callback: Function) {
    super.insert(ns.toString(), ops, options, callback);
  }

  // Update
  update(ns: any, ops: any, options: any, callback: Function) {
    super.update(ns.toString(), ops, options, callback);
  }

  // Remove
  remove(ns: any, ops: any, options: any, callback: Function) {
    super.remove(ns.toString(), ops, options, callback);
  }
}

export = NativeTopology;
