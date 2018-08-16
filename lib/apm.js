'use strict';
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const path = require('path');
const Readable = require('stream').Readable;
const EJSON = require('mongodb-extjson');

class Instrumentation extends EventEmitter {
  constructor() {
    super();
  }

  instrument(MongoClient, callback) {
    // store a reference to the original functions
    this.$MongoClient = MongoClient;
    const $prototypeConnect = (this.$prototypeConnect = MongoClient.prototype.connect);

    const instrumentation = this;
    MongoClient.prototype.connect = function(callback) {
      this.s.options.monitorCommands = true;
      this.on('commandStarted', event => instrumentation.emit('started', event));
      this.on('commandSucceeded', event => instrumentation.emit('succeeded', event));
      this.on('commandFailed', event => instrumentation.emit('failed', event));
      return $prototypeConnect.call(this, callback);
    };

    if (typeof callback === 'function') callback(null, this);
  }

  uninstrument() {
    this.$MongoClient.prototype.connect = this.$prototypeConnect;
  }
}

const apmLoggingEvents = {
  command: ['commandStarted', 'commandSucceeded', 'commandFailed'],
  sdam: [
    'serverOpening',
    'serverDescriptionChanged',
    'serverHeartbeatStarted',
    'serverHeartbeatSucceeded',
    'serverHeartbeatFailed',
    'serverClosed',
    'topologyOpening',
    'topologyClosed',
    'topologyDescriptionChanged'
  ]
};

class apmReadableStream extends Readable {
  constructor(client, categories) {
    super();
    categories.forEach(category => {
      attachMonitorListenerCategory(client, category, this);
    });
  }

  _read() {
    return;
  }
}

function apmLoggingEventHandler(client) {
  return function(err) {
    if (!err) return;
    if (!client.topology) throw err;
    client.close(true, () => {
      throw err;
    });
  };
}

function getMonitoringCategories(categories) {
  const allCategories = Object.keys(apmLoggingEvents);
  // enable all monitors if monitor = all
  if (categories === 'all') return allCategories;
  // else, ensure `monitors` is an array
  const categoriesArray = Array.isArray(categories) ? categories : [categories];

  // make sure each category is valid
  categoriesArray.forEach(c => {
    if (allCategories.indexOf(c) === -1) {
      throw new TypeError(`Invalid APM monitoring category specified: ${c}`);
    }
  });

  return categoriesArray;
}

function resolveMonitoringOutputFile(monitorOut) {
  const defaultFileName = `${process.cwd()}/mongodb-monitoring-${new Date().toISOString()}.log`;
  if (!monitorOut) return defaultFileName;
  if (monitorOut === 'stderr' || monitorOut === 'stdout') return monitorOut;
  return path.resolve(monitorOut);
}

function createMonitorWriteStream(fileName) {
  if (fileName === 'stderr' || fileName === 'stdout') return process[fileName];
  const writeStream = fs.createWriteStream(fileName, { flags: 'a' });
  return writeStream;
}

/**
 * Attach a category (`command` or `sdam`) of event listeners to the given
 * client. When an event of that category is emitted, a log line will
 * be pushed to the given readable stream, which should be then piped to a
 * writable stream.
 *
 * @param {MongoClient} client the client to which the listeners are attached
 * @param {String} category the category of events to listen for
 * @param {ReadableStream} readableStream stream to which log output will be pushed
 */
function attachMonitorListenerCategory(client, category, readableStream) {
  apmLoggingEvents[category].forEach(eventName => {
    client.on(eventName, e => {
      const logObj = {
        timestamp: Date.now(),
        category: category,
        name: eventName,
        object: e
      };
      const logLine = EJSON.stringify(logObj, { relaxed: true }) + '\n';
      readableStream.push(logLine);
    });
  });
}

module.exports = {
  Instrumentation,
  apmReadableStream,
  apmLoggingEventHandler,
  getMonitoringCategories,
  resolveMonitoringOutputFile,
  createMonitorWriteStream
};
