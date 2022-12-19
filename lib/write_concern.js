"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WriteConcern = exports.WRITE_CONCERN_KEYS = void 0;
exports.WRITE_CONCERN_KEYS = ['w', 'wtimeout', 'j', 'journal', 'fsync'];
/**
 * A MongoDB WriteConcern, which describes the level of acknowledgement
 * requested from MongoDB for write operations.
 * @public
 *
 * @see https://docs.mongodb.com/manual/reference/write-concern/
 */
class WriteConcern {
    /**
     * Constructs a WriteConcern from the write concern properties.
     * @param w - request acknowledgment that the write operation has propagated to a specified number of mongod instances or to mongod instances with specified tags.
     * @param wtimeout - specify a time limit to prevent write operations from blocking indefinitely
     * @param j - request acknowledgment that the write operation has been written to the on-disk journal
     * @param fsync - equivalent to the j option
     */
    constructor(w, wtimeout, j, fsync) {
        if (w != null) {
            if (!Number.isNaN(Number(w))) {
                this.w = Number(w);
            }
            else {
                this.w = w;
            }
        }
        if (wtimeout != null) {
            this.wtimeout = wtimeout;
        }
        if (j != null) {
            this.j = j;
        }
        if (fsync != null) {
            this.fsync = fsync;
        }
    }
    /** Construct a WriteConcern given an options object. */
    static fromOptions(options, inherit) {
        if (options == null)
            return undefined;
        inherit = inherit !== null && inherit !== void 0 ? inherit : {};
        let opts;
        if (typeof options === 'string' || typeof options === 'number') {
            opts = { w: options };
        }
        else if (options instanceof WriteConcern) {
            opts = options;
        }
        else {
            opts = options.writeConcern;
        }
        const parentOpts = inherit instanceof WriteConcern ? inherit : inherit.writeConcern;
        const { w = undefined, wtimeout = undefined, j = undefined, fsync = undefined, journal = undefined, wtimeoutMS = undefined } = {
            ...parentOpts,
            ...opts
        };
        if (w != null ||
            wtimeout != null ||
            wtimeoutMS != null ||
            j != null ||
            journal != null ||
            fsync != null) {
            return new WriteConcern(w, wtimeout !== null && wtimeout !== void 0 ? wtimeout : wtimeoutMS, j !== null && j !== void 0 ? j : journal, fsync);
        }
        return undefined;
    }
}
exports.WriteConcern = WriteConcern;
//# sourceMappingURL=write_concern.js.map