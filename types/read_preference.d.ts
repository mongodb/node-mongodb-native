interface ReadPreferenceOptions {
    /** Max secondary read staleness in seconds, Minimum value is 90 seconds. */
    maxStalenessSeconds?: number;
}
export declare class ReadPreference {
    static PRIMARY: "primary";
    static PRIMARY_PREFERRED: "primaryPreferred";
    static SECONDARY: "secondary";
    static SECONDARY_PREFERRED: "secondaryPreferred";
    static NEAREST: "nearest";
    static primary: ReadPreference;
    static primaryPreferred: ReadPreference;
    static secondary: ReadPreference;
    static secondaryPreferred: ReadPreference;
    static nearest: ReadPreference;
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
    constructor(mode: string, tags?: object[], options?: ReadPreferenceOptions);
    /**
     * Construct a ReadPreference given an options object.
     *
     * @param {object} options The options object from which to extract the read preference.
     * @returns {ReadPreference}
     */
    static fromOptions(options: any): ReadPreference | null;
    /**
     * Validate if a mode is legal
     *
     * @function
     * @param mode The string representing the read preference mode.
     * @returns True if a mode is valid
     */
    static isValid(mode: string): boolean;
    isValid(mode: string): boolean;
    get preference(): string;
    slaveOk(): boolean;
    equals(readPreference: ReadPreference): boolean;
    toJSON(): object;
}
export {};
