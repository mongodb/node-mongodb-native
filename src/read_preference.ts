interface ReadPreferenceOptions {
  /** Max secondary read staleness in seconds, Minimum value is 90 seconds. */
  maxStalenessSeconds?: number;
}

export class ReadPreference {
  static PRIMARY = 'primary' as const;
  static PRIMARY_PREFERRED = 'primaryPreferred' as const;
  static SECONDARY = 'secondary' as const;
  static SECONDARY_PREFERRED = 'secondaryPreferred' as const;
  static NEAREST = 'nearest' as const;

  static primary = new ReadPreference(ReadPreference.PRIMARY);
  static primaryPreferred = new ReadPreference(ReadPreference.PRIMARY_PREFERRED);
  static secondary = new ReadPreference(ReadPreference.SECONDARY);
  static secondaryPreferred = new ReadPreference(ReadPreference.SECONDARY_PREFERRED);
  static nearest = new ReadPreference(ReadPreference.NEAREST);

  mode: string;
  tags?: object[];
  maxStalenessSeconds?: number;
  minWireVersion?: number;

  /**
   * The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
   * used to construct connections.
   *
   * @param mode A string describing the read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
   * @param tags A tag set used to target reads to members with the specified tag(s). tagSet is not available if using read preference mode primary.
   * @param options Additional read preference options
   * @param options.maxStalenessSeconds
   * @see https://docs.mongodb.com/manual/core/read-preference/
   */
  constructor(mode: string, tags?: object[], options: ReadPreferenceOptions = {}) {
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
    this.maxStalenessSeconds = undefined;

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
    }
  }

  /**
   * Construct a ReadPreference given an options object.
   *
   * @param {object} options The options object from which to extract the read preference.
   * @returns {ReadPreference}
   */
  static fromOptions(options: any): ReadPreference | null {
    const readPreference = options.readPreference;
    const readPreferenceTags = options.readPreferenceTags;

    if (readPreference == null) {
      return null;
    }

    if (typeof readPreference === 'string') {
      return new ReadPreference(readPreference, readPreferenceTags);
    } else if (!(readPreference instanceof ReadPreference) && typeof readPreference === 'object') {
      const mode = readPreference.mode || readPreference.preference;
      if (mode && typeof mode === 'string') {
        return new ReadPreference(mode, readPreference.tags, {
          maxStalenessSeconds: readPreference.maxStalenessSeconds
        });
      }
    }

    return readPreference;
  }

  /**
   * Validate if a mode is legal
   *
   * @function
   * @param mode The string representing the read preference mode.
   * @returns True if a mode is valid
   */
  static isValid(mode: string): boolean {
    const modes: string[] = [
      ReadPreference.PRIMARY,
      ReadPreference.PRIMARY_PREFERRED,
      ReadPreference.SECONDARY,
      ReadPreference.SECONDARY_PREFERRED,
      ReadPreference.NEAREST,
      (null as unknown) as string
    ];
    return modes.indexOf(mode) !== -1;
  }

  isValid(mode: string): boolean {
    return ReadPreference.isValid(typeof mode === 'string' ? mode : this.mode);
  }

  // Support the deprecated `preference` property introduced in the porcelain layer
  get preference() {
    return this.mode;
  }

  slaveOk(): boolean {
    return (
      ['primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'].indexOf(this.mode) !== -1
    );
  }

  equals(readPreference: ReadPreference): boolean {
    return readPreference.mode === this.mode;
  }

  toJSON(): object {
    const readPreference = {
      mode: this.mode,
      tags: Array.isArray(this.tags) ? this.tags : undefined,
      maxStalenessSeconds: this.maxStalenessSeconds ? this.maxStalenessSeconds : undefined
    };
    return readPreference;
  }
}
