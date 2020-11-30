/** @public */
export type W = number | 'majority';

/** @public */
export interface WriteConcernOptions {
  /** The write concern */
  w?: W;
  /** The write concern timeout */
  wtimeout?: number;
  /** The write concern timeout */
  wtimeoutMS?: number;
  /** The journal write concern */
  j?: boolean;
  /** The journal write concern */
  journal?: boolean;
  /** The file sync write concern */
  fsync?: boolean | 1;
  /** Write Concern as an object */
  writeConcern?: WriteConcernOptions | WriteConcern | W;
}

/**
 * A MongoDB WriteConcern, which describes the level of acknowledgement
 * requested from MongoDB for write operations.
 * @public
 *
 * @see https://docs.mongodb.com/manual/reference/write-concern/
 */
export class WriteConcern {
  /** request acknowledgment that the write operation has propagated to a specified number of mongod instances or to mongod instances with specified tags. */
  w?: W;
  /** specify a time limit to prevent write operations from blocking indefinitely */
  wtimeout?: number;
  /** request acknowledgment that the write operation has been written to the on-disk journal */
  j?: boolean;
  /** equivalent to the j option */
  fsync?: boolean | 1;

  /**
   * Constructs a WriteConcern from the write concern properties.
   * @param w - request acknowledgment that the write operation has propagated to a specified number of mongod instances or to mongod instances with specified tags.
   * @param wtimeout - specify a time limit to prevent write operations from blocking indefinitely
   * @param j - request acknowledgment that the write operation has been written to the on-disk journal
   * @param fsync - equivalent to the j option
   */
  constructor(w?: W, wtimeout?: number, j?: boolean, fsync?: boolean | 1) {
    if (w != null) {
      if (!Number.isNaN(Number(w))) {
        this.w = Number(w);
      } else {
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
  static fromOptions(
    options?: WriteConcernOptions | WriteConcern | W,
    inherit?: WriteConcernOptions | WriteConcern
  ): WriteConcern | undefined {
    const { fromOptions } = WriteConcern;
    if (typeof options === 'undefined') return undefined;
    if (typeof options === 'number') return fromOptions({ ...inherit, w: options });
    if (typeof options === 'string') return fromOptions({ ...inherit, w: options });
    if (options instanceof WriteConcern) return fromOptions({ ...inherit, ...options });
    if (options.writeConcern) {
      const { writeConcern, ...viable } = { ...inherit, ...options };
      return fromOptions(writeConcern, viable);
    }
    const { w, wtimeout, j, fsync, journal, wtimeoutMS } = { ...inherit, ...options };
    if (
      w != null ||
      wtimeout != null ||
      wtimeoutMS != null ||
      j != null ||
      journal != null ||
      fsync != null
    ) {
      return new WriteConcern(w, wtimeout ?? wtimeoutMS, j ?? journal, fsync);
    }
    return undefined;
  }
}
