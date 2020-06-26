'use strict';
import Logger = require('../logger');
import { EventEmitter } from 'events';
import dns = require('dns');

/**
 * Determines whether a provided address matches the provided parent domain in order
 * to avoid certain attack vectors.
 *
 * @param {string} srvAddress The address to check against a domain
 * @param {string} parentDomain The domain to check the provided address against
 * @returns {boolean} Whether the provided address matches the parent domain
 */
function matchesParentDomain(srvAddress: string, parentDomain: string): boolean {
  const regex = /^.*?\./;
  const srv = `.${srvAddress.replace(regex, '')}`;
  const parent = `.${parentDomain.replace(regex, '')}`;
  return srv.endsWith(parent);
}

class SrvPollingEvent {
  srvRecords: any;
  constructor(srvRecords: any) {
    this.srvRecords = srvRecords;
  }

  addresses() {
    return new Set(this.srvRecords.map((record: any) => `${record.name}:${record.port}`));
  }
}

class SrvPoller extends EventEmitter {
  srvHost: any;
  rescanSrvIntervalMS: any;
  heartbeatFrequencyMS: any;
  logger: any;
  haMode: any;
  generation: any;
  _timeout: any;

  /**
   * @param {object} options
   * @param {string} options.srvHost
   * @param {number} [options.heartbeatFrequencyMS]
   * @param {Function} [options.logger]
   * @param {string} [options.loggerLevel]
   */
  constructor(options: any) {
    super();

    if (!options || !options.srvHost) {
      throw new TypeError('options for SrvPoller must exist and include srvHost');
    }

    this.srvHost = options.srvHost;
    this.rescanSrvIntervalMS = 60000;
    this.heartbeatFrequencyMS = options.heartbeatFrequencyMS || 10000;
    this.logger = new Logger('srvPoller', options);

    this.haMode = false;
    this.generation = 0;

    this._timeout = null;
  }

  get srvAddress() {
    return `_mongodb._tcp.${this.srvHost}`;
  }

  get intervalMS() {
    return this.haMode ? this.heartbeatFrequencyMS : this.rescanSrvIntervalMS;
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

  success(srvRecords: any) {
    this.haMode = false;
    this.schedule();
    this.emit('srvRecordDiscovery', new SrvPollingEvent(srvRecords));
  }

  /**
   * @param {any} message
   * @param {any} [obj]
   */
  failure(message: any, obj?: any) {
    this.logger.warn(message, obj);
    this.haMode = true;
    this.schedule();
  }

  parentDomainMismatch(srvRecord: any) {
    this.logger.warn(
      `parent domain mismatch on SRV record (${srvRecord.name}:${srvRecord.port})`,
      srvRecord
    );
  }

  _poll() {
    const generation = this.generation;
    dns.resolveSrv(this.srvAddress, (err?: any, srvRecords?: any) => {
      if (generation !== this.generation) {
        return;
      }

      if (err) {
        this.failure('DNS error', err);
        return;
      }

      const finalAddresses: any = [];
      srvRecords.forEach((record: any) => {
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

export { SrvPollingEvent, SrvPoller };
