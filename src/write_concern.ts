/** @public */
export type W = number | 'majority';

/** @public */
export interface WriteConcernOptions {
  /** Write Concern as an object */
  writeConcern?: WriteConcern | WriteConcernSettings;
}

/** @public */
export interface WriteConcernSettings {
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
}

/**
 * A MongoDB WriteConcern, which describes the level of acknowledgement
 * requested from MongoDB for write operations.
 * @public
 *
 * @see https://docs.mongodb.com/manual/reference/write-concern/
 */
export class WriteConcern {
  /** The write concern */
  w?: W;
  /** The write concern timeout */
  wtimeout?: number;
  /** The journal write concern */
  j?: boolean;
  /** The file sync write concern */
  fsync?: boolean | 1;

  /** Constructs a WriteConcern from the write concern properties. */
  constructor(
    /** The write concern */
    w?: W,
    /** The write concern timeout */
    wtimeout?: number,
    /** The journal write concern */
    j?: boolean,
    /** The file sync write concern */
    fsync?: boolean | 1
  ) {
    if (w != null) {
      this.w = w;
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
    options?: WriteConcernOptions | WriteConcern,
    inherit?: WriteConcernOptions | WriteConcern
  ): WriteConcern | undefined {
    if (typeof options === 'undefined') return undefined;
    inherit = inherit ?? {};
    const opts: WriteConcern | WriteConcernSettings | undefined =
      options instanceof WriteConcern ? options : options.writeConcern;
    const parentOpts: WriteConcern | WriteConcernSettings | undefined =
      inherit instanceof WriteConcern ? inherit : inherit.writeConcern;

    const { w, wtimeout, j, fsync, journal, wtimeoutMS } = { ...parentOpts, ...opts };
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
