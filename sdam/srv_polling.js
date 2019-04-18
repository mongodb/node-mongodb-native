'use strict';

const Logger = require('../connection/logger');
const EventEmitter = require('events').EventEmitter;
const dns = require('dns');
/**
 * Determines whether a provided address matches the provided parent domain in order
 * to avoid certain attack vectors.
 *
 * @param {String} srvAddress The address to check against a domain
 * @param {String} parentDomain The domain to check the provided address against
 * @return {Boolean} Whether the provided address matches the parent domain
 */
function matchesParentDomain(srvAddress, parentDomain) {
  const regex = /^.*?\./;
  const srv = `.${srvAddress.replace(regex, '')}`;
  const parent = `.${parentDomain.replace(regex, '')}`;
  return srv.endsWith(parent);
}

class SrvPollingEvent {
  constructor(srvRecords) {
    this.srvRecords = srvRecords;
  }

  addresses() {
    return new Set(this.srvRecords.map(record => `${record.name}:${record.port}`));
  }
}

class SrvPoller extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.srvHost
   * @param {number} [options.heartbeatFrequencyMS]
   * @param {function} [options.logger]
   * @param {string} [options.loggerLevel]
   */
  constructor(options) {
    super();

    if (!options || !options.srvHost) {
      throw new TypeError('options for SrvPoller must exist and include srvHost');
    }

    this.srvHost = options.srvHost;
    this.rescanSrvIntervalMS = 60000;
    this.heartbeatFrequencyMS = options.heartbeatFrequencyMS || 10000;
    this.logger = Logger('srvPoller', options);

    this.haMode = false;
    this.generation = 0;

    this._timeout = null;
  }

  get srvAddress() {
    return `_mongodb._tcp.${this.srvHost}`;
  }

  get intervalMS() {
    return this.haMode ? this.heartbeatFrequencyMS : this.rescanSrvIntervalMs;
  }

  start() {
    if (!this._timeout) {
      this.schedule();
    }
  }

  stop() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this.generation += 1;
      this._timeout = null;
    }
  }

  schedule() {
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => this._poll(), this.intervalMS);
  }

  success(srvRecords) {
    this.haMode = false;
    this.schedule();
    this.emit('srvRecordDiscovery', new SrvPollingEvent(srvRecords));
  }

  failure(message, obj) {
    this.logger.warn(message, obj);
    this.haMode = true;
    this.schedule();
  }

  parentDomainMismatch(srvRecord) {
    this.logger.warn(
      `parent domain mismatch on SRV record (${srvRecord.name}:${srvRecord.port})`,
      srvRecord
    );
  }

  _poll() {
    const generation = this.generation;
    dns.resolveSrv(this.srvAddress, (err, srvRecords) => {
      if (generation !== this.generation) {
        return;
      }

      if (err) {
        this.failure('DNS error', err);
        return;
      }

      const finalAddresses = [];
      srvRecords.forEach(record => {
        if (matchesParentDomain(record.name, this.srvHost)) {
          finalAddresses.push(record);
        } else {
          this.parentDomainMismatch(record);
        }
      });

      if (!finalAddresses.length) {
        this.failure('No valid addresses found at host');
        return;
      }

      this.success(finalAddresses);
    });
  }
}

module.exports.SrvPollingEvent = SrvPollingEvent;
module.exports.SrvPoller = SrvPoller;
