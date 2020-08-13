import type { TagSet } from './sdam/server_description';

export type ReadPreferenceLike =
  | ReadPreference
  | ReadPreferenceMode
  | keyof typeof ReadPreferenceMode;

export enum ReadPreferenceMode {
  primary = 'primary',
  primaryPreferred = 'primaryPreferred',
  secondary = 'secondary',
  secondaryPreferred = 'secondaryPreferred',
  nearest = 'nearest'
}

export interface HedgeOptions {
  /** Explicitly enable or disable hedged reads. */
  enabled?: boolean;
}

export interface ReadPreferenceOptions {
  /** Max secondary read staleness in seconds, Minimum value is 90 seconds.*/
  maxStalenessSeconds?: number;
  /** Server mode in which the same query is dispatched in parallel to multiple replica set members. */
  hedge?: HedgeOptions;
}

export interface ReadPreferenceLikeOptions {
  readPreference?:
    | ReadPreferenceLike
    | {
        mode: ReadPreferenceMode;
        preference: ReadPreferenceMode;
        tags: TagSet[];
        maxStalenessSeconds: number;
      };
}

/**
 * The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
 * used to construct connections.
 *
 * @see https://docs.mongodb.com/manual/core/read-preference/
 * @returns {ReadPreference}
 */
export class ReadPreference {
  mode: ReadPreferenceMode;
  tags?: TagSet[];
  hedge?: HedgeOptions;
  maxStalenessSeconds?: number;
  minWireVersion?: number;

  public static PRIMARY = ReadPreferenceMode.primary;
  public static PRIMARY_PREFERRED = ReadPreferenceMode.primaryPreferred;
  public static SECONDARY = ReadPreferenceMode.secondary;
  public static SECONDARY_PREFERRED = ReadPreferenceMode.secondaryPreferred;
  public static NEAREST = ReadPreferenceMode.nearest;

  public static primary = new ReadPreference(ReadPreferenceMode.primary);
  public static primaryPreferred = new ReadPreference(ReadPreferenceMode.primaryPreferred);
  public static secondary = new ReadPreference(ReadPreferenceMode.secondary);
  public static secondaryPreferred = new ReadPreference(ReadPreferenceMode.secondaryPreferred);
  public static nearest = new ReadPreference(ReadPreferenceMode.nearest);

  /**
   * Create a read preference
   *
   * @param {string} mode A string describing the read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
   * @param {object[]} [tags] A tag set used to target reads to members with the specified tag(s). tagSet is not available if using read preference mode primary.
   * @param {object} [options] Additional read preference options
   * @param {number} [options.maxStalenessSeconds] Max secondary read staleness in seconds, Minimum value is 90 seconds.
   * @param {object} [options.hedge] Server mode in which the same query is dispatched in parallel to multiple replica set members.
   * @param {boolean} [options.hedge.enabled] Explicitly enable or disable hedged reads.
   */
  constructor(mode: ReadPreferenceMode, tags?: TagSet[], options?: ReadPreferenceOptions) {
    if (!ReadPreference.isValid(mode)) {
      throw new TypeError(`Invalid read preference mode ${mode}`);
    }
    if (options === undefined && typeof tags === 'object' && !Array.isArray(tags)) {
      options = tags;
      tags = undefined;
    } else if (tags && !Array.isArray(tags)) {
      throw new TypeError('ReadPreference tags must be an array');
    }

    this.mode = mode;
    this.tags = tags;
    this.hedge = options?.hedge;

    options = options || {};
    if (options.maxStalenessSeconds != null) {
      if (options.maxStalenessSeconds <= 0) {
        throw new TypeError('maxStalenessSeconds must be a positive integer');
      }

      this.maxStalenessSeconds = options.maxStalenessSeconds;

      // NOTE: The minimum required wire version is 5 for this read preference. If the existing
      //       topology has a lower value then a MongoError will be thrown during server selection.
      this.minWireVersion = 5;
    }

    if (this.mode === ReadPreference.PRIMARY) {
      if (this.tags && Array.isArray(this.tags) && this.tags.length > 0) {
        throw new TypeError('Primary read preference cannot be combined with tags');
      }

      if (this.maxStalenessSeconds) {
        throw new TypeError('Primary read preference cannot be combined with maxStalenessSeconds');
      }

      if (this.hedge) {
        throw new TypeError('Primary read preference cannot be combined with hedge');
      }
    }
  }

  // Support the deprecated `preference` property introduced in the porcelain layer
  get preference() {
    return this.mode;
  }

  static fromString(mode: string): ReadPreference {
    return new ReadPreference(mode as ReadPreferenceMode);
  }

  /**
   * Construct a ReadPreference given an options object.
   *
   * @param {any} options The options object from which to extract the read preference.
   * @returns {ReadPreference|null}
   */
  static fromOptions(options: any): ReadPreference | undefined {
    const readPreference = options.readPreference;
    const readPreferenceTags = options.readPreferenceTags;

    if (readPreference == null) {
      return;
    }

    if (typeof readPreference === 'string') {
      return new ReadPreference(readPreference as ReadPreferenceMode, readPreferenceTags);
    } else if (!(readPreference instanceof ReadPreference) && typeof readPreference === 'object') {
      const mode = readPreference.mode || readPreference.preference;
      if (mode && typeof mode === 'string') {
        return new ReadPreference(mode as ReadPreferenceMode, readPreference.tags, {
          maxStalenessSeconds: readPreference.maxStalenessSeconds,
          hedge: options.hedge
        });
      }
    }

    return readPreference;
  }

  /**
   * Resolves a read preference based on well-defined inheritance rules. This method will not only
   * determine the read preference (if there is one), but will also ensure the returned value is a
   * properly constructed instance of `ReadPreference`.
   *
   * @param {Collection|Db|MongoClient} parent The parent of the operation on which to determine the read
   * preference, used for determining the inherited read preference.
   * @param {any} options The options passed into the method, potentially containing a read preference
   * @returns {(ReadPreference|null)} The resolved read preference
   */
  static resolve(parent: any, options: any): ReadPreference {
    options = options || {};
    const session = options.session;

    const inheritedReadPreference = parent && parent.readPreference;

    let readPreference;
    if (options.readPreference) {
      readPreference = ReadPreference.fromOptions(options);
    } else if (session && session.inTransaction() && session.transaction.options.readPreference) {
      // The transaction’s read preference MUST override all other user configurable read preferences.
      readPreference = session.transaction.options.readPreference;
    } else if (inheritedReadPreference != null) {
      readPreference = inheritedReadPreference;
    } else {
      readPreference = ReadPreference.primary;
    }

    return typeof readPreference === 'string'
      ? new ReadPreference(readPreference as ReadPreferenceMode)
      : readPreference;
  }

  /**
   * Replaces options.readPreference with a ReadPreference instance
   */
  static translate(options: ReadPreferenceLikeOptions) {
    if (options.readPreference == null) return options;
    const r = options.readPreference;

    if (typeof r === 'string') {
      options.readPreference = new ReadPreference(r as ReadPreferenceMode);
    } else if (r && !(r instanceof ReadPreference) && typeof r === 'object') {
      const mode = r.mode || r.preference;
      if (mode && typeof mode === 'string') {
        options.readPreference = new ReadPreference(mode as ReadPreferenceMode, r.tags, {
          maxStalenessSeconds: r.maxStalenessSeconds
        });
      }
    } else if (!(r instanceof ReadPreference)) {
      throw new TypeError('Invalid read preference: ' + r);
    }

    return options;
  }

  /**
   * Validate if a mode is legal
   *
   * @function
   * @param {string} mode The string representing the read preference mode.
   * @returns {boolean} True if a mode is valid
   */
  static isValid(mode: string): boolean {
    const VALID_MODES = new Set([
      ReadPreference.PRIMARY,
      ReadPreference.PRIMARY_PREFERRED,
      ReadPreference.SECONDARY,
      ReadPreference.SECONDARY_PREFERRED,
      ReadPreference.NEAREST,
      null
    ]);

    return VALID_MODES.has(mode as ReadPreferenceMode);
  }

  /**
   * Validate if a mode is legal
   *
   * @function
   * @param {string} mode The string representing the read preference mode.
   * @returns {boolean} True if a mode is valid
   */
  isValid(mode?: string): boolean {
    return ReadPreference.isValid(typeof mode === 'string' ? mode : this.mode);
  }

  /**
   * Indicates that this readPreference needs the "slaveOk" bit when sent over the wire
   *
   * @function
   * @returns {boolean}
   * @see https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/#op-query
   */
  slaveOk(): boolean {
    const NEEDS_SLAVEOK = new Set([
      ReadPreference.PRIMARY_PREFERRED,
      ReadPreference.SECONDARY,
      ReadPreference.SECONDARY_PREFERRED,
      ReadPreference.NEAREST
    ]);

    return NEEDS_SLAVEOK.has(this.mode);
  }

  /**
   * Are the two read preference equal
   *
   * @function
   * @param {ReadPreference} readPreference The read preference with which to check equality
   * @returns {boolean} True if the two ReadPreferences are equivalent
   */
  equals(readPreference: ReadPreference): boolean {
    return readPreference.mode === this.mode;
  }

  /**
   * Return JSON representation
   *
   * @function
   * @returns {object} A JSON representation of the ReadPreference
   */
  toJSON(): object {
    const readPreference = { mode: this.mode } as any;
    if (Array.isArray(this.tags)) readPreference.tags = this.tags;
    if (this.maxStalenessSeconds) readPreference.maxStalenessSeconds = this.maxStalenessSeconds;
    if (this.hedge) readPreference.hedge = this.hedge;
    return readPreference;
  }
}
