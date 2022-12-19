"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrvPoller = exports.SrvPollingEvent = void 0;
const dns = require("dns");
const timers_1 = require("timers");
const error_1 = require("../error");
const logger_1 = require("../logger");
const mongo_types_1 = require("../mongo_types");
const utils_1 = require("../utils");
/**
 * Determines whether a provided address matches the provided parent domain in order
 * to avoid certain attack vectors.
 *
 * @param srvAddress - The address to check against a domain
 * @param parentDomain - The domain to check the provided address against
 * @returns Whether the provided address matches the parent domain
 */
function matchesParentDomain(srvAddress, parentDomain) {
    const regex = /^.*?\./;
    const srv = `.${srvAddress.replace(regex, '')}`;
    const parent = `.${parentDomain.replace(regex, '')}`;
    return srv.endsWith(parent);
}
/**
 * @internal
 * @category Event
 */
class SrvPollingEvent {
    constructor(srvRecords) {
        this.srvRecords = srvRecords;
    }
    hostnames() {
        return new Set(this.srvRecords.map(r => utils_1.HostAddress.fromSrvRecord(r).toString()));
    }
}
exports.SrvPollingEvent = SrvPollingEvent;
/** @internal */
class SrvPoller extends mongo_types_1.TypedEventEmitter {
    constructor(options) {
        var _a, _b, _c;
        super();
        if (!options || !options.srvHost) {
            throw new error_1.MongoRuntimeError('Options for SrvPoller must exist and include srvHost');
        }
        this.srvHost = options.srvHost;
        this.srvMaxHosts = (_a = options.srvMaxHosts) !== null && _a !== void 0 ? _a : 0;
        this.srvServiceName = (_b = options.srvServiceName) !== null && _b !== void 0 ? _b : 'mongodb';
        this.rescanSrvIntervalMS = 60000;
        this.heartbeatFrequencyMS = (_c = options.heartbeatFrequencyMS) !== null && _c !== void 0 ? _c : 10000;
        this.logger = new logger_1.Logger('srvPoller', options);
        this.haMode = false;
        this.generation = 0;
        this._timeout = undefined;
    }
    get srvAddress() {
        return `_${this.srvServiceName}._tcp.${this.srvHost}`;
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
            (0, timers_1.clearTimeout)(this._timeout);
            this.generation += 1;
            this._timeout = undefined;
        }
    }
    schedule() {
        if (this._timeout) {
            (0, timers_1.clearTimeout)(this._timeout);
        }
        this._timeout = (0, timers_1.setTimeout)(() => {
            this._poll().catch(unexpectedRuntimeError => {
                this.logger.error(`Unexpected ${new error_1.MongoRuntimeError(unexpectedRuntimeError).stack}`);
            });
        }, this.intervalMS);
    }
    success(srvRecords) {
        this.haMode = false;
        this.schedule();
        this.emit(SrvPoller.SRV_RECORD_DISCOVERY, new SrvPollingEvent(srvRecords));
    }
    failure(message, obj) {
        this.logger.warn(message, obj);
        this.haMode = true;
        this.schedule();
    }
    parentDomainMismatch(srvRecord) {
        this.logger.warn(`parent domain mismatch on SRV record (${srvRecord.name}:${srvRecord.port})`, srvRecord);
    }
    async _poll() {
        const generation = this.generation;
        let srvRecords;
        try {
            srvRecords = await dns.promises.resolveSrv(this.srvAddress);
        }
        catch (dnsError) {
            this.failure('DNS error', dnsError);
            return;
        }
        if (generation !== this.generation) {
            return;
        }
        const finalAddresses = [];
        for (const record of srvRecords) {
            if (matchesParentDomain(record.name, this.srvHost)) {
                finalAddresses.push(record);
            }
            else {
                this.parentDomainMismatch(record);
            }
        }
        if (!finalAddresses.length) {
            this.failure('No valid addresses found at host');
            return;
        }
        this.success(finalAddresses);
    }
}
exports.SrvPoller = SrvPoller;
/** @event */
SrvPoller.SRV_RECORD_DISCOVERY = 'srvRecordDiscovery';
//# sourceMappingURL=srv_polling.js.map