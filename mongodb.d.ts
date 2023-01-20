/// <reference types="node" />

import { Binary } from 'bson';
import { BSONRegExp } from 'bson';
import { BSONSymbol } from 'bson';
import { BSONType } from 'bson';
import { Code } from 'bson';
import type { ConnectionOptions as ConnectionOptions_2 } from 'tls';
import { DBRef } from 'bson';
import { Decimal128 } from 'bson';
import type { deserialize as deserialize_2 } from 'bson';
import type { DeserializeOptions } from 'bson';
import * as dns from 'dns';
import { Document } from 'bson';
import { Double } from 'bson';
import { Duplex } from 'stream';
import { DuplexOptions } from 'stream';
import { EventEmitter } from 'events';
import { Int32 } from 'bson';
import { Long } from 'bson';
import { MaxKey } from 'bson';
import { MinKey } from 'bson';
import { ObjectId } from 'bson';
import type { ObjectIdLike } from 'bson';
import { Readable } from 'stream';
import type { serialize as serialize_2 } from 'bson';
import type { SerializeOptions } from 'bson';
import type { Socket } from 'net';
import type { SrvRecord } from 'dns';
import type { TcpNetConnectOpts } from 'net';
import { Timestamp } from 'bson';
import type { TLSSocket } from 'tls';
import type { TLSSocketOptions } from 'tls';
import { Writable } from 'stream';

/** @public */
export declare abstract class AbstractCursor<TSchema = any, CursorEvents extends AbstractCursorEvents = AbstractCursorEvents> extends TypedEventEmitter<CursorEvents> {
    /* Excluded from this release type: [kId] */
    /* Excluded from this release type: [kSession] */
    /* Excluded from this release type: [kServer] */
    /* Excluded from this release type: [kNamespace] */
    /* Excluded from this release type: [kDocuments] */
    /* Excluded from this release type: [kClient] */
    /* Excluded from this release type: [kTransform] */
    /* Excluded from this release type: [kInitialized] */
    /* Excluded from this release type: [kClosed] */
    /* Excluded from this release type: [kKilled] */
    /* Excluded from this release type: [kOptions] */
    /** @event */
    static readonly CLOSE: "close";
    /* Excluded from this release type: __constructor */
    get id(): Long | undefined;
    /* Excluded from this release type: client */
    /* Excluded from this release type: server */
    get namespace(): MongoDBNamespace;
    get readPreference(): ReadPreference;
    get readConcern(): ReadConcern | undefined;
    /* Excluded from this release type: session */
    /* Excluded from this release type: session */
    /* Excluded from this release type: cursorOptions */
    get closed(): boolean;
    get killed(): boolean;
    get loadBalanced(): boolean;
    /** Returns current buffered documents length */
    bufferedCount(): number;
    /** Returns current buffered documents */
    readBufferedDocuments(number?: number): TSchema[];
    [Symbol.asyncIterator](): AsyncIterator<TSchema, void>;
    stream(options?: CursorStreamOptions): Readable & AsyncIterable<TSchema>;
    hasNext(): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    hasNext(callback: Callback<boolean>): void;
    /** Get the next available document from the cursor, returns null if no more documents are available. */
    next(): Promise<TSchema | null>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    next(callback: Callback<TSchema | null>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    next(callback?: Callback<TSchema | null>): Promise<TSchema | null> | void;
    /**
     * Try to get the next available document from the cursor or `null` if an empty batch is returned
     */
    tryNext(): Promise<TSchema | null>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    tryNext(callback: Callback<TSchema | null>): void;
    /**
     * Iterates over all the documents for this cursor using the iterator, callback pattern.
     *
     * If the iterator returns `false`, iteration will stop.
     *
     * @param iterator - The iteration callback.
     * @param callback - The end callback.
     */
    forEach(iterator: (doc: TSchema) => boolean | void): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    forEach(iterator: (doc: TSchema) => boolean | void, callback: Callback<void>): void;
    close(): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    close(callback: Callback): void;
    /**
     * @deprecated options argument is deprecated
     */
    close(options: CursorCloseOptions): Promise<void>;
    /**
     * @deprecated options argument is deprecated. Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance
     */
    close(options: CursorCloseOptions, callback: Callback): void;
    /**
     * Returns an array of documents. The caller is responsible for making sure that there
     * is enough memory to store the results. Note that the array only contains partial
     * results when this cursor had been previously accessed. In that case,
     * cursor.rewind() can be used to reset the cursor.
     *
     * @param callback - The result callback.
     */
    toArray(): Promise<TSchema[]>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    toArray(callback: Callback<TSchema[]>): void;
    /**
     * Add a cursor flag to the cursor
     *
     * @param flag - The flag to set, must be one of following ['tailable', 'oplogReplay', 'noCursorTimeout', 'awaitData', 'partial' -.
     * @param value - The flag boolean value.
     */
    addCursorFlag(flag: CursorFlag, value: boolean): this;
    /**
     * Map all documents using the provided function
     * If there is a transform set on the cursor, that will be called first and the result passed to
     * this function's transform.
     *
     * @remarks
     *
     * **Note** Cursors use `null` internally to indicate that there are no more documents in the cursor. Providing a mapping
     * function that maps values to `null` will result in the cursor closing itself before it has finished iterating
     * all documents.  This will **not** result in a memory leak, just surprising behavior.  For example:
     *
     * ```typescript
     * const cursor = collection.find({});
     * cursor.map(() => null);
     *
     * const documents = await cursor.toArray();
     * // documents is always [], regardless of how many documents are in the collection.
     * ```
     *
     * Other falsey values are allowed:
     *
     * ```typescript
     * const cursor = collection.find({});
     * cursor.map(() => '');
     *
     * const documents = await cursor.toArray();
     * // documents is now an array of empty strings
     * ```
     *
     * **Note for Typescript Users:** adding a transform changes the return type of the iteration of this cursor,
     * it **does not** return a new instance of a cursor. This means when calling map,
     * you should always assign the result to a new variable in order to get a correctly typed cursor variable.
     * Take note of the following example:
     *
     * @example
     * ```typescript
     * const cursor: FindCursor<Document> = coll.find();
     * const mappedCursor: FindCursor<number> = cursor.map(doc => Object.keys(doc).length);
     * const keyCounts: number[] = await mappedCursor.toArray(); // cursor.toArray() still returns Document[]
     * ```
     * @param transform - The mapping transformation method.
     */
    map<T = any>(transform: (doc: TSchema) => T): AbstractCursor<T>;
    /**
     * Set the ReadPreference for the cursor.
     *
     * @param readPreference - The new read preference for the cursor.
     */
    withReadPreference(readPreference: ReadPreferenceLike): this;
    /**
     * Set the ReadPreference for the cursor.
     *
     * @param readPreference - The new read preference for the cursor.
     */
    withReadConcern(readConcern: ReadConcernLike): this;
    /**
     * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
     *
     * @param value - Number of milliseconds to wait before aborting the query.
     */
    maxTimeMS(value: number): this;
    /**
     * Set the batch size for the cursor.
     *
     * @param value - The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find/|find command documentation}.
     */
    batchSize(value: number): this;
    /**
     * Rewind this cursor to its uninitialized state. Any options that are present on the cursor will
     * remain in effect. Iterating this cursor will cause new queries to be sent to the server, even
     * if the resultant data has already been retrieved by this cursor.
     */
    rewind(): void;
    /**
     * Returns a new uninitialized copy of this cursor, with options matching those that have been set on the current instance
     */
    abstract clone(): AbstractCursor<TSchema>;
    /* Excluded from this release type: _initialize */
    /* Excluded from this release type: _getMore */
    /* Excluded from this release type: [kInit] */
}

/** @public */
export declare type AbstractCursorEvents = {
    [AbstractCursor.CLOSE](): void;
};

/** @public */
export declare interface AbstractCursorOptions extends BSONSerializeOptions {
    session?: ClientSession;
    readPreference?: ReadPreferenceLike;
    readConcern?: ReadConcernLike;
    /**
     * Specifies the number of documents to return in each response from MongoDB
     */
    batchSize?: number;
    /**
     * When applicable `maxTimeMS` controls the amount of time the initial command
     * that constructs a cursor should take. (ex. find, aggregate, listCollections)
     */
    maxTimeMS?: number;
    /**
     * When applicable `maxAwaitTimeMS` controls the amount of time subsequent getMores
     * that a cursor uses to fetch more data should take. (ex. cursor.next())
     */
    maxAwaitTimeMS?: number;
    /**
     * Comment to apply to the operation.
     *
     * In server versions pre-4.4, 'comment' must be string.  A server
     * error will be thrown if any other type is provided.
     *
     * In server versions 4.4 and above, 'comment' can be any valid BSON type.
     */
    comment?: unknown;
    /**
     * By default, MongoDB will automatically close a cursor when the
     * client has exhausted all results in the cursor. However, for [capped collections](https://www.mongodb.com/docs/manual/core/capped-collections)
     * you may use a Tailable Cursor that remains open after the client exhausts
     * the results in the initial cursor.
     */
    tailable?: boolean;
    /**
     * If awaitData is set to true, when the cursor reaches the end of the capped collection,
     * MongoDB blocks the query thread for a period of time waiting for new data to arrive.
     * When new data is inserted into the capped collection, the blocked thread is signaled
     * to wake up and return the next batch to the client.
     */
    awaitData?: boolean;
    noCursorTimeout?: boolean;
}

/* Excluded from this release type: AbstractOperation */

/** @public */
export declare type AcceptedFields<TSchema, FieldType, AssignableType> = {
    readonly [key in KeysOfAType<TSchema, FieldType>]?: AssignableType;
};

/** @public */
export declare type AddToSetOperators<Type> = {
    $each?: Array<Flatten<Type>>;
};

/** @public */
export declare interface AddUserOptions extends CommandOperationOptions {
    /** @deprecated Please use db.command('createUser', ...) instead for this option */
    digestPassword?: null;
    /** Roles associated with the created user */
    roles?: string | string[] | RoleSpecification | RoleSpecification[];
    /** Custom data associated with the user (only Mongodb 2.6 or higher) */
    customData?: Document;
}

/**
 * The **Admin** class is an internal class that allows convenient access to
 * the admin functionality and commands for MongoDB.
 *
 * **ADMIN Cannot directly be instantiated**
 * @public
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb';
 *
 * const client = new MongoClient('mongodb://localhost:27017');
 * const admin = client.db().admin();
 * const dbInfo = await admin.listDatabases();
 * for (const db of dbInfo.databases) {
 *   console.log(db.name);
 * }
 * ```
 */
export declare class Admin {
    /* Excluded from this release type: s */
    /* Excluded from this release type: __constructor */
    /**
     * Execute a command
     *
     * @param command - The command to execute
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    command(command: Document): Promise<Document>;
    command(command: Document, options: RunCommandOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    command(command: Document, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
    /**
     * Retrieve the server build information
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    buildInfo(): Promise<Document>;
    buildInfo(options: CommandOperationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    buildInfo(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    buildInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
    /**
     * Retrieve the server build information
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    serverInfo(): Promise<Document>;
    serverInfo(options: CommandOperationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    serverInfo(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    serverInfo(options: CommandOperationOptions, callback: Callback<Document>): void;
    /**
     * Retrieve this db's server status.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    serverStatus(): Promise<Document>;
    serverStatus(options: CommandOperationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    serverStatus(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    serverStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
    /**
     * Ping the MongoDB server and retrieve results
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    ping(): Promise<Document>;
    ping(options: CommandOperationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    ping(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    ping(options: CommandOperationOptions, callback: Callback<Document>): void;
    /**
     * Add a user to the database
     *
     * @param username - The username for the new user
     * @param password - An optional password for the new user
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    addUser(username: string): Promise<Document>;
    addUser(username: string, password: string): Promise<Document>;
    addUser(username: string, options: AddUserOptions): Promise<Document>;
    addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, password: string, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, password: string, options: AddUserOptions, callback: Callback<Document>): void;
    /**
     * Remove a user from a database
     *
     * @param username - The username to remove
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    removeUser(username: string): Promise<boolean>;
    removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    removeUser(username: string, callback: Callback<boolean>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
    /**
     * Validate an existing collection
     *
     * @param collectionName - The name of the collection to validate.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    validateCollection(collectionName: string): Promise<Document>;
    validateCollection(collectionName: string, options: ValidateCollectionOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    validateCollection(collectionName: string, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    validateCollection(collectionName: string, options: ValidateCollectionOptions, callback: Callback<Document>): void;
    /**
     * List the available databases
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    listDatabases(): Promise<ListDatabasesResult>;
    listDatabases(options: ListDatabasesOptions): Promise<ListDatabasesResult>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    listDatabases(callback: Callback<ListDatabasesResult>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    listDatabases(options: ListDatabasesOptions, callback: Callback<ListDatabasesResult>): void;
    /**
     * Get ReplicaSet status
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    replSetGetStatus(): Promise<Document>;
    replSetGetStatus(options: CommandOperationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    replSetGetStatus(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    replSetGetStatus(options: CommandOperationOptions, callback: Callback<Document>): void;
}

/* Excluded from this release type: AdminPrivate */

/* Excluded from this release type: AggregateOperation */

/** @public */
export declare interface AggregateOptions extends CommandOperationOptions {
    /** allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 \>). */
    allowDiskUse?: boolean;
    /** The number of documents to return per batch. See [aggregation documentation](https://docs.mongodb.com/manual/reference/command/aggregate). */
    batchSize?: number;
    /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
    bypassDocumentValidation?: boolean;
    /** Return the query as cursor, on 2.6 \> it returns as a real cursor on pre 2.6 it returns as an emulated cursor. */
    cursor?: Document;
    /** specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point. */
    maxTimeMS?: number;
    /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. */
    maxAwaitTimeMS?: number;
    /** Specify collation. */
    collation?: CollationOptions;
    /** Add an index selection hint to an aggregation command */
    hint?: Hint;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
    out?: string;
}

/**
 * The **AggregationCursor** class is an internal class that embodies an aggregation cursor on MongoDB
 * allowing for iteration over the results returned from the underlying query. It supports
 * one by one document iteration, conversion to an array or can be iterated as a Node 4.X
 * or higher stream
 * @public
 */
export declare class AggregationCursor<TSchema = any> extends AbstractCursor<TSchema> {
    /* Excluded from this release type: [kPipeline] */
    /* Excluded from this release type: [kOptions] */
    /* Excluded from this release type: __constructor */
    get pipeline(): Document[];
    clone(): AggregationCursor<TSchema>;
    map<T>(transform: (doc: TSchema) => T): AggregationCursor<T>;
    /* Excluded from this release type: _initialize */
    /** Execute the explain for the cursor */
    explain(): Promise<Document>;
    explain(verbosity: ExplainVerbosityLike): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    explain(callback: Callback): void;
    /** Add a group stage to the aggregation pipeline */
    group<T = TSchema>($group: Document): AggregationCursor<T>;
    /** Add a limit stage to the aggregation pipeline */
    limit($limit: number): this;
    /** Add a match stage to the aggregation pipeline */
    match($match: Document): this;
    /** Add an out stage to the aggregation pipeline */
    out($out: {
        db: string;
        coll: string;
    } | string): this;
    /**
     * Add a project stage to the aggregation pipeline
     *
     * @remarks
     * In order to strictly type this function you must provide an interface
     * that represents the effect of your projection on the result documents.
     *
     * By default chaining a projection to your cursor changes the returned type to the generic {@link Document} type.
     * You should specify a parameterized type to have assertions on your final results.
     *
     * @example
     * ```typescript
     * // Best way
     * const docs: AggregationCursor<{ a: number }> = cursor.project<{ a: number }>({ _id: 0, a: true });
     * // Flexible way
     * const docs: AggregationCursor<Document> = cursor.project({ _id: 0, a: true });
     * ```
     *
     * @remarks
     * In order to strictly type this function you must provide an interface
     * that represents the effect of your projection on the result documents.
     *
     * **Note for Typescript Users:** adding a transform changes the return type of the iteration of this cursor,
     * it **does not** return a new instance of a cursor. This means when calling project,
     * you should always assign the result to a new variable in order to get a correctly typed cursor variable.
     * Take note of the following example:
     *
     * @example
     * ```typescript
     * const cursor: AggregationCursor<{ a: number; b: string }> = coll.aggregate([]);
     * const projectCursor = cursor.project<{ a: number }>({ _id: 0, a: true });
     * const aPropOnlyArray: {a: number}[] = await projectCursor.toArray();
     *
     * // or always use chaining and save the final cursor
     *
     * const cursor = coll.aggregate().project<{ a: string }>({
     *   _id: 0,
     *   a: { $convert: { input: '$a', to: 'string' }
     * }});
     * ```
     */
    project<T extends Document = Document>($project: Document): AggregationCursor<T>;
    /** Add a lookup stage to the aggregation pipeline */
    lookup($lookup: Document): this;
    /** Add a redact stage to the aggregation pipeline */
    redact($redact: Document): this;
    /** Add a skip stage to the aggregation pipeline */
    skip($skip: number): this;
    /** Add a sort stage to the aggregation pipeline */
    sort($sort: Sort): this;
    /** Add a unwind stage to the aggregation pipeline */
    unwind($unwind: Document | string): this;
    /** Add a geoNear stage to the aggregation pipeline */
    geoNear($geoNear: Document): this;
}

/** @public */
export declare interface AggregationCursorOptions extends AbstractCursorOptions, AggregateOptions {
}

/**
 * It is possible to search using alternative types in mongodb e.g.
 * string types can be searched using a regex in mongo
 * array types can be searched using their element type
 * @public
 */
export declare type AlternativeType<T> = T extends ReadonlyArray<infer U> ? T | RegExpOrString<U> : RegExpOrString<T>;

/** @public */
export declare type AnyBulkWriteOperation<TSchema extends Document = Document> = {
    insertOne: InsertOneModel<TSchema>;
} | {
    replaceOne: ReplaceOneModel<TSchema>;
} | {
    updateOne: UpdateOneModel<TSchema>;
} | {
    updateMany: UpdateManyModel<TSchema>;
} | {
    deleteOne: DeleteOneModel<TSchema>;
} | {
    deleteMany: DeleteManyModel<TSchema>;
};

/** @public */
export declare type AnyError = MongoError | Error;

/** @public */
export declare type ArrayElement<Type> = Type extends ReadonlyArray<infer Item> ? Item : never;

/** @public */
export declare type ArrayOperator<Type> = {
    $each?: Array<Flatten<Type>>;
    $slice?: number;
    $position?: number;
    $sort?: Sort;
};

/** @public */
export declare interface Auth {
    /** The username for auth */
    username?: string;
    /** The password for auth */
    password?: string;
}

/** @public */
export declare const AuthMechanism: Readonly<{
    readonly MONGODB_AWS: "MONGODB-AWS";
    readonly MONGODB_CR: "MONGODB-CR";
    readonly MONGODB_DEFAULT: "DEFAULT";
    readonly MONGODB_GSSAPI: "GSSAPI";
    readonly MONGODB_PLAIN: "PLAIN";
    readonly MONGODB_SCRAM_SHA1: "SCRAM-SHA-1";
    readonly MONGODB_SCRAM_SHA256: "SCRAM-SHA-256";
    readonly MONGODB_X509: "MONGODB-X509";
}>;

/** @public */
export declare type AuthMechanism = typeof AuthMechanism[keyof typeof AuthMechanism];

/** @public */
export declare interface AuthMechanismProperties extends Document {
    SERVICE_HOST?: string;
    SERVICE_NAME?: string;
    SERVICE_REALM?: string;
    CANONICALIZE_HOST_NAME?: GSSAPICanonicalizationValue;
    AWS_SESSION_TOKEN?: string;
}

/** @public */
export declare interface AutoEncrypter {
    new (client: MongoClient, options: AutoEncryptionOptions): AutoEncrypter;
    init(cb: Callback): void;
    teardown(force: boolean, callback: Callback): void;
    encrypt(ns: string, cmd: Document, options: any, callback: Callback<Document>): void;
    decrypt(cmd: Document, options: any, callback: Callback<Document>): void;
    /** @experimental */
    readonly cryptSharedLibVersionInfo: {
        version: bigint;
        versionStr: string;
    } | null;
}

/** @public */
export declare const AutoEncryptionLoggerLevel: Readonly<{
    readonly FatalError: 0;
    readonly Error: 1;
    readonly Warning: 2;
    readonly Info: 3;
    readonly Trace: 4;
}>;

/** @public */
export declare type AutoEncryptionLoggerLevel = typeof AutoEncryptionLoggerLevel[keyof typeof AutoEncryptionLoggerLevel];

/** @public */
export declare interface AutoEncryptionOptions {
    /* Excluded from this release type: bson */
    /* Excluded from this release type: metadataClient */
    /** A `MongoClient` used to fetch keys from a key vault */
    keyVaultClient?: MongoClient;
    /** The namespace where keys are stored in the key vault */
    keyVaultNamespace?: string;
    /** Configuration options that are used by specific KMS providers during key generation, encryption, and decryption. */
    kmsProviders?: {
        /** Configuration options for using 'aws' as your KMS provider */
        aws?: {
            /** The access key used for the AWS KMS provider */
            accessKeyId: string;
            /** The secret access key used for the AWS KMS provider */
            secretAccessKey: string;
            /**
             * An optional AWS session token that will be used as the
             * X-Amz-Security-Token header for AWS requests.
             */
            sessionToken?: string;
        };
        /** Configuration options for using 'local' as your KMS provider */
        local?: {
            /**
             * The master key used to encrypt/decrypt data keys.
             * A 96-byte long Buffer or base64 encoded string.
             */
            key: Buffer | string;
        };
        /** Configuration options for using 'azure' as your KMS provider */
        azure?: {
            /** The tenant ID identifies the organization for the account */
            tenantId: string;
            /** The client ID to authenticate a registered application */
            clientId: string;
            /** The client secret to authenticate a registered application */
            clientSecret: string;
            /**
             * If present, a host with optional port. E.g. "example.com" or "example.com:443".
             * This is optional, and only needed if customer is using a non-commercial Azure instance
             * (e.g. a government or China account, which use different URLs).
             * Defaults to "login.microsoftonline.com"
             */
            identityPlatformEndpoint?: string | undefined;
        };
        /** Configuration options for using 'gcp' as your KMS provider */
        gcp?: {
            /** The service account email to authenticate */
            email: string;
            /** A PKCS#8 encrypted key. This can either be a base64 string or a binary representation */
            privateKey: string | Buffer;
            /**
             * If present, a host with optional port. E.g. "example.com" or "example.com:443".
             * Defaults to "oauth2.googleapis.com"
             */
            endpoint?: string | undefined;
        };
        /**
         * Configuration options for using 'kmip' as your KMS provider
         */
        kmip?: {
            /**
             * The output endpoint string.
             * The endpoint consists of a hostname and port separated by a colon.
             * E.g. "example.com:123". A port is always present.
             */
            endpoint?: string;
        };
    };
    /**
     * A map of namespaces to a local JSON schema for encryption
     *
     * **NOTE**: Supplying options.schemaMap provides more security than relying on JSON Schemas obtained from the server.
     * It protects against a malicious server advertising a false JSON Schema, which could trick the client into sending decrypted data that should be encrypted.
     * Schemas supplied in the schemaMap only apply to configuring automatic encryption for Client-Side Field Level Encryption.
     * Other validation rules in the JSON schema will not be enforced by the driver and will result in an error.
     */
    schemaMap?: Document;
    /** @experimental Public Technical Preview: Supply a schema for the encrypted fields in the document  */
    encryptedFieldsMap?: Document;
    /** Allows the user to bypass auto encryption, maintaining implicit decryption */
    bypassAutoEncryption?: boolean;
    /** @experimental Public Technical Preview: Allows users to bypass query analysis */
    bypassQueryAnalysis?: boolean;
    options?: {
        /** An optional hook to catch logging messages from the underlying encryption engine */
        logger?: (level: AutoEncryptionLoggerLevel, message: string) => void;
    };
    extraOptions?: {
        /**
         * A local process the driver communicates with to determine how to encrypt values in a command.
         * Defaults to "mongodb://%2Fvar%2Fmongocryptd.sock" if domain sockets are available or "mongodb://localhost:27020" otherwise
         */
        mongocryptdURI?: string;
        /** If true, autoEncryption will not attempt to spawn a mongocryptd before connecting  */
        mongocryptdBypassSpawn?: boolean;
        /** The path to the mongocryptd executable on the system */
        mongocryptdSpawnPath?: string;
        /** Command line arguments to use when auto-spawning a mongocryptd */
        mongocryptdSpawnArgs?: string[];
        /**
         * Full path to a MongoDB Crypt shared library to be used (instead of mongocryptd).
         *
         * This needs to be the path to the file itself, not a directory.
         * It can be an absolute or relative path. If the path is relative and
         * its first component is `$ORIGIN`, it will be replaced by the directory
         * containing the mongodb-client-encryption native addon file. Otherwise,
         * the path will be interpreted relative to the current working directory.
         *
         * Currently, loading different MongoDB Crypt shared library files from different
         * MongoClients in the same process is not supported.
         *
         * If this option is provided and no MongoDB Crypt shared library could be loaded
         * from the specified location, creating the MongoClient will fail.
         *
         * If this option is not provided and `cryptSharedLibRequired` is not specified,
         * the AutoEncrypter will attempt to spawn and/or use mongocryptd according
         * to the mongocryptd-specific `extraOptions` options.
         *
         * Specifying a path prevents mongocryptd from being used as a fallback.
         *
         * Requires the MongoDB Crypt shared library, available in MongoDB 6.0 or higher.
         */
        cryptSharedLibPath?: string;
        /**
         * If specified, never use mongocryptd and instead fail when the MongoDB Crypt
         * shared library could not be loaded.
         *
         * This is always true when `cryptSharedLibPath` is specified.
         *
         * Requires the MongoDB Crypt shared library, available in MongoDB 6.0 or higher.
         */
        cryptSharedLibRequired?: boolean;
        /* Excluded from this release type: cryptSharedLibSearchPaths */
    };
    proxyOptions?: ProxyOptions;
    /** The TLS options to use connecting to the KMS provider */
    tlsOptions?: {
        aws?: AutoEncryptionTlsOptions;
        local?: AutoEncryptionTlsOptions;
        azure?: AutoEncryptionTlsOptions;
        gcp?: AutoEncryptionTlsOptions;
        kmip?: AutoEncryptionTlsOptions;
    };
}

/** @public */
export declare interface AutoEncryptionTlsOptions {
    /**
     * Specifies the location of a local .pem file that contains
     * either the client's TLS/SSL certificate and key or only the
     * client's TLS/SSL key when tlsCertificateFile is used to
     * provide the certificate.
     */
    tlsCertificateKeyFile?: string;
    /**
     * Specifies the password to de-crypt the tlsCertificateKeyFile.
     */
    tlsCertificateKeyFilePassword?: string;
    /**
     * Specifies the location of a local .pem file that contains the
     * root certificate chain from the Certificate Authority.
     * This file is used to validate the certificate presented by the
     * KMS provider.
     */
    tlsCAFile?: string;
}

/**
 * Keeps the state of a unordered batch so we can rewrite the results
 * correctly after command execution
 *
 * @public
 */
export declare class Batch<T = Document> {
    originalZeroIndex: number;
    currentIndex: number;
    originalIndexes: number[];
    batchType: BatchType;
    operations: T[];
    size: number;
    sizeBytes: number;
    constructor(batchType: BatchType, originalZeroIndex: number);
}

/** @public */
export declare const BatchType: Readonly<{
    readonly INSERT: 1;
    readonly UPDATE: 2;
    readonly DELETE: 3;
}>;

/** @public */
export declare type BatchType = typeof BatchType[keyof typeof BatchType];

export { Binary }

/* Excluded from this release type: BinMsg */

/** @public */
export declare type BitwiseFilter = number /** numeric bit mask */ | Binary /** BinData bit mask */ | ReadonlyArray<number>;

/* Excluded from this release type: BSON */
export { BSONRegExp }

/**
 * BSON Serialization options.
 * @public
 */
export declare interface BSONSerializeOptions extends Omit<SerializeOptions, 'index'>, Omit<DeserializeOptions, 'evalFunctions' | 'cacheFunctions' | 'cacheFunctionsCrc32' | 'allowObjectSmallerThanBufferSize' | 'index' | 'validation'> {
    /**
     * Enabling the raw option will return a [Node.js Buffer](https://nodejs.org/api/buffer.html)
     * which is allocated using [allocUnsafe API](https://nodejs.org/api/buffer.html#static-method-bufferallocunsafesize).
     * See this section from the [Node.js Docs here](https://nodejs.org/api/buffer.html#what-makes-bufferallocunsafe-and-bufferallocunsafeslow-unsafe)
     * for more detail about what "unsafe" refers to in this context.
     * If you need to maintain your own editable clone of the bytes returned for an extended life time of the process, it is recommended you allocate
     * your own buffer and clone the contents:
     *
     * @example
     * ```ts
     * const raw = await collection.findOne({}, { raw: true });
     * const myBuffer = Buffer.alloc(raw.byteLength);
     * myBuffer.set(raw, 0);
     * // Only save and use `myBuffer` beyond this point
     * ```
     *
     * @remarks
     * Please note there is a known limitation where this option cannot be used at the MongoClient level (see [NODE-3946](https://jira.mongodb.org/browse/NODE-3946)).
     * It does correctly work at `Db`, `Collection`, and per operation the same as other BSON options work.
     */
    raw?: boolean;
    /** Enable utf8 validation when deserializing BSON documents.  Defaults to true. */
    enableUtf8Validation?: boolean;
}

export { BSONSymbol }

export { BSONType }

/** @public */
export declare type BSONTypeAlias = keyof typeof BSONType;

/* Excluded from this release type: BufferPool */

/** @public */
export declare abstract class BulkOperationBase {
    isOrdered: boolean;
    /* Excluded from this release type: s */
    operationId?: number;
    /* Excluded from this release type: __constructor */
    /**
     * Add a single insert document to the bulk operation
     *
     * @example
     * ```ts
     * const bulkOp = collection.initializeOrderedBulkOp();
     *
     * // Adds three inserts to the bulkOp.
     * bulkOp
     *   .insert({ a: 1 })
     *   .insert({ b: 2 })
     *   .insert({ c: 3 });
     * await bulkOp.execute();
     * ```
     */
    insert(document: Document): BulkOperationBase;
    /**
     * Builds a find operation for an update/updateOne/delete/deleteOne/replaceOne.
     * Returns a builder object used to complete the definition of the operation.
     *
     * @example
     * ```ts
     * const bulkOp = collection.initializeOrderedBulkOp();
     *
     * // Add an updateOne to the bulkOp
     * bulkOp.find({ a: 1 }).updateOne({ $set: { b: 2 } });
     *
     * // Add an updateMany to the bulkOp
     * bulkOp.find({ c: 3 }).update({ $set: { d: 4 } });
     *
     * // Add an upsert
     * bulkOp.find({ e: 5 }).upsert().updateOne({ $set: { f: 6 } });
     *
     * // Add a deletion
     * bulkOp.find({ g: 7 }).deleteOne();
     *
     * // Add a multi deletion
     * bulkOp.find({ h: 8 }).delete();
     *
     * // Add a replaceOne
     * bulkOp.find({ i: 9 }).replaceOne({writeConcern: { j: 10 }});
     *
     * // Update using a pipeline (requires Mongodb 4.2 or higher)
     * bulk.find({ k: 11, y: { $exists: true }, z: { $exists: true } }).updateOne([
     *   { $set: { total: { $sum: [ '$y', '$z' ] } } }
     * ]);
     *
     * // All of the ops will now be executed
     * await bulkOp.execute();
     * ```
     */
    find(selector: Document): FindOperators;
    /** Specifies a raw operation to perform in the bulk write. */
    raw(op: AnyBulkWriteOperation): this;
    get bsonOptions(): BSONSerializeOptions;
    get writeConcern(): WriteConcern | undefined;
    get batches(): Batch[];
    execute(options?: BulkWriteOptions): Promise<BulkWriteResult>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    execute(callback: Callback<BulkWriteResult>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    execute(options: BulkWriteOptions | undefined, callback: Callback<BulkWriteResult>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    execute(options?: BulkWriteOptions | Callback<BulkWriteResult>, callback?: Callback<BulkWriteResult>): Promise<BulkWriteResult> | void;
    /* Excluded from this release type: handleWriteError */
    abstract addToOperationsList(batchType: BatchType, document: Document | UpdateStatement | DeleteStatement): this;
}

/* Excluded from this release type: BulkOperationPrivate */

/**
 * @public
 *
 * @deprecated Will be made internal in 5.0
 */
export declare interface BulkResult {
    ok: number;
    writeErrors: WriteError[];
    writeConcernErrors: WriteConcernError[];
    insertedIds: Document[];
    nInserted: number;
    nUpserted: number;
    nMatched: number;
    nModified: number;
    nRemoved: number;
    upserted: Document[];
    opTime?: Document;
}

/** @public */
export declare interface BulkWriteOperationError {
    index: number;
    code: number;
    errmsg: string;
    errInfo: Document;
    op: Document | UpdateStatement | DeleteStatement;
}

/** @public */
export declare interface BulkWriteOptions extends CommandOperationOptions {
    /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
    bypassDocumentValidation?: boolean;
    /** If true, when an insert fails, don't execute the remaining writes. If false, continue with remaining inserts when one fails. */
    ordered?: boolean;
    /** @deprecated use `ordered` instead */
    keepGoing?: boolean;
    /** Force server to assign _id values instead of driver. */
    forceServerObjectId?: boolean;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
}

/**
 * @public
 * The result of a bulk write.
 */
export declare class BulkWriteResult {
    /** @deprecated Will be removed in 5.0 */
    result: BulkResult;
    /* Excluded from this release type: __constructor */
    /** Number of documents inserted. */
    get insertedCount(): number;
    /** Number of documents matched for update. */
    get matchedCount(): number;
    /** Number of documents modified. */
    get modifiedCount(): number;
    /** Number of documents deleted. */
    get deletedCount(): number;
    /** Number of documents upserted. */
    get upsertedCount(): number;
    /** Upserted document generated Id's, hash key is the index of the originating operation */
    get upsertedIds(): {
        [key: number]: any;
    };
    /** Inserted document generated Id's, hash key is the index of the originating operation */
    get insertedIds(): {
        [key: number]: any;
    };
    /** Evaluates to true if the bulk operation correctly executes */
    get ok(): number;
    /** The number of inserted documents */
    get nInserted(): number;
    /** Number of upserted documents */
    get nUpserted(): number;
    /** Number of matched documents */
    get nMatched(): number;
    /** Number of documents updated physically on disk */
    get nModified(): number;
    /** Number of removed documents */
    get nRemoved(): number;
    /** Returns an array of all inserted ids */
    getInsertedIds(): Document[];
    /** Returns an array of all upserted ids */
    getUpsertedIds(): Document[];
    /** Returns the upserted id at the given index */
    getUpsertedIdAt(index: number): Document | undefined;
    /** Returns raw internal result */
    getRawResponse(): Document;
    /** Returns true if the bulk operation contains a write error */
    hasWriteErrors(): boolean;
    /** Returns the number of write errors off the bulk operation */
    getWriteErrorCount(): number;
    /** Returns a specific write error object */
    getWriteErrorAt(index: number): WriteError | undefined;
    /** Retrieve all write errors */
    getWriteErrors(): WriteError[];
    /**
     * Retrieve lastOp if available
     *
     * @deprecated Will be removed in 5.0
     */
    getLastOp(): Document | undefined;
    /** Retrieve the write concern error if one exists */
    getWriteConcernError(): WriteConcernError | undefined;
    toJSON(): BulkResult;
    toString(): string;
    isOk(): boolean;
}

/**
 * MongoDB Driver style callback
 * @public
 */
export declare type Callback<T = any> = (error?: AnyError, result?: T) => void;

/** @public */
export declare class CancellationToken extends TypedEventEmitter<{
    cancel(): void;
}> {
}

/**
 * Creates a new Change Stream instance. Normally created using {@link Collection#watch|Collection.watch()}.
 * @public
 */
export declare class ChangeStream<TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>> extends TypedEventEmitter<ChangeStreamEvents<TSchema, TChange>> {
    pipeline: Document[];
    options: ChangeStreamOptions;
    parent: MongoClient | Db | Collection;
    namespace: MongoDBNamespace;
    type: symbol;
    /* Excluded from this release type: cursor */
    streamOptions?: CursorStreamOptions;
    /* Excluded from this release type: [kCursorStream] */
    /* Excluded from this release type: [kClosed] */
    /* Excluded from this release type: [kMode] */
    /** @event */
    static readonly RESPONSE: "response";
    /** @event */
    static readonly MORE: "more";
    /** @event */
    static readonly INIT: "init";
    /** @event */
    static readonly CLOSE: "close";
    /**
     * Fired for each new matching change in the specified namespace. Attaching a `change`
     * event listener to a Change Stream will switch the stream into flowing mode. Data will
     * then be passed as soon as it is available.
     * @event
     */
    static readonly CHANGE: "change";
    /** @event */
    static readonly END: "end";
    /** @event */
    static readonly ERROR: "error";
    /**
     * Emitted each time the change stream stores a new resume token.
     * @event
     */
    static readonly RESUME_TOKEN_CHANGED: "resumeTokenChanged";
    /* Excluded from this release type: __constructor */
    /* Excluded from this release type: cursorStream */
    /** The cached resume token that is used to resume after the most recently returned change. */
    get resumeToken(): ResumeToken;
    /** Check if there is any document still available in the Change Stream */
    hasNext(): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    hasNext(callback: Callback<boolean>): void;
    /** Get the next available document from the Change Stream. */
    next(): Promise<TChange>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    next(callback: Callback<TChange>): void;
    /**
     * Try to get the next available document from the Change Stream's cursor or `null` if an empty batch is returned
     */
    tryNext(): Promise<Document | null>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    tryNext(callback: Callback<Document | null>): void;
    [Symbol.asyncIterator](): AsyncGenerator<TChange, void, void>;
    /** Is the cursor closed */
    get closed(): boolean;
    /** Close the Change Stream */
    close(): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    close(callback: Callback): void;
    /**
     * Return a modified Readable stream including a possible transform method.
     *
     * NOTE: When using a Stream to process change stream events, the stream will
     * NOT automatically resume in the case a resumable error is encountered.
     *
     * @throws MongoChangeStreamError if the underlying cursor or the change stream is closed
     */
    stream(options?: CursorStreamOptions): Readable & AsyncIterable<TChange>;
    /* Excluded from this release type: _setIsEmitter */
    /* Excluded from this release type: _setIsIterator */
    /* Excluded from this release type: _createChangeStreamCursor */
    /* Excluded from this release type: _closeEmitterModeWithError */
    /* Excluded from this release type: _streamEvents */
    /* Excluded from this release type: _endStream */
    /* Excluded from this release type: _processChange */
    /* Excluded from this release type: _processErrorStreamMode */
    /* Excluded from this release type: _processErrorIteratorMode */
}

/* Excluded from this release type: ChangeStreamAggregateRawResult */

/**
 * Only present when the `showExpandedEvents` flag is enabled.
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export declare interface ChangeStreamCollModDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID {
    /** Describes the type of operation represented in this change notification */
    operationType: 'modify';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export declare interface ChangeStreamCreateDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID {
    /** Describes the type of operation represented in this change notification */
    operationType: 'create';
}

/**
 * Only present when the `showExpandedEvents` flag is enabled.
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export declare interface ChangeStreamCreateIndexDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID, ChangeStreamDocumentOperationDescription {
    /** Describes the type of operation represented in this change notification */
    operationType: 'createIndexes';
}

/* Excluded from this release type: ChangeStreamCursor */

/* Excluded from this release type: ChangeStreamCursorOptions */

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#delete-event
 */
export declare interface ChangeStreamDeleteDocument<TSchema extends Document = Document> extends ChangeStreamDocumentCommon, ChangeStreamDocumentKey<TSchema>, ChangeStreamDocumentCollectionUUID {
    /** Describes the type of operation represented in this change notification */
    operationType: 'delete';
    /** Namespace the delete event occurred on */
    ns: ChangeStreamNameSpace;
    /**
     * Contains the pre-image of the modified or deleted document if the
     * pre-image is available for the change event and either 'required' or
     * 'whenAvailable' was specified for the 'fullDocumentBeforeChange' option
     * when creating the change stream. If 'whenAvailable' was specified but the
     * pre-image is unavailable, this will be explicitly set to null.
     */
    fullDocumentBeforeChange?: TSchema;
}

/** @public */
export declare type ChangeStreamDocument<TSchema extends Document = Document> = ChangeStreamInsertDocument<TSchema> | ChangeStreamUpdateDocument<TSchema> | ChangeStreamReplaceDocument<TSchema> | ChangeStreamDeleteDocument<TSchema> | ChangeStreamDropDocument | ChangeStreamRenameDocument | ChangeStreamDropDatabaseDocument | ChangeStreamInvalidateDocument | ChangeStreamCreateIndexDocument | ChangeStreamCreateDocument | ChangeStreamCollModDocument | ChangeStreamDropIndexDocument | ChangeStreamShardCollectionDocument | ChangeStreamReshardCollectionDocument | ChangeStreamRefineCollectionShardKeyDocument;

/** @public */
export declare interface ChangeStreamDocumentCollectionUUID {
    /**
     * The UUID (Binary subtype 4) of the collection that the operation was performed on.
     *
     * Only present when the `showExpandedEvents` flag is enabled.
     *
     * **NOTE:** collectionUUID will be converted to a NodeJS Buffer if the promoteBuffers
     *    flag is enabled.
     *
     * @sinceServerVersion 6.1.0
     */
    collectionUUID: Binary;
}

/** @public */
export declare interface ChangeStreamDocumentCommon {
    /**
     * The id functions as an opaque token for use when resuming an interrupted
     * change stream.
     */
    _id: ResumeToken;
    /**
     * The timestamp from the oplog entry associated with the event.
     * For events that happened as part of a multi-document transaction, the associated change stream
     * notifications will have the same clusterTime value, namely the time when the transaction was committed.
     * On a sharded cluster, events that occur on different shards can have the same clusterTime but be
     * associated with different transactions or even not be associated with any transaction.
     * To identify events for a single transaction, you can use the combination of lsid and txnNumber in the change stream event document.
     */
    clusterTime?: Timestamp;
    /**
     * The transaction number.
     * Only present if the operation is part of a multi-document transaction.
     *
     * **NOTE:** txnNumber can be a Long if promoteLongs is set to false
     */
    txnNumber?: number;
    /**
     * The identifier for the session associated with the transaction.
     * Only present if the operation is part of a multi-document transaction.
     */
    lsid?: ServerSessionId;
}

/** @public */
export declare interface ChangeStreamDocumentKey<TSchema extends Document = Document> {
    /**
     * For unsharded collections this contains a single field `_id`.
     * For sharded collections, this will contain all the components of the shard key
     */
    documentKey: {
        _id: InferIdType<TSchema>;
        [shardKey: string]: any;
    };
}

/** @public */
export declare interface ChangeStreamDocumentOperationDescription {
    /**
     * An description of the operation.
     *
     * Only present when the `showExpandedEvents` flag is enabled.
     *
     * @sinceServerVersion 6.1.0
     */
    operationDescription?: Document;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#dropdatabase-event
 */
export declare interface ChangeStreamDropDatabaseDocument extends ChangeStreamDocumentCommon {
    /** Describes the type of operation represented in this change notification */
    operationType: 'dropDatabase';
    /** The database dropped */
    ns: {
        db: string;
    };
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#drop-event
 */
export declare interface ChangeStreamDropDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID {
    /** Describes the type of operation represented in this change notification */
    operationType: 'drop';
    /** Namespace the drop event occurred on */
    ns: ChangeStreamNameSpace;
}

/**
 * Only present when the `showExpandedEvents` flag is enabled.
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export declare interface ChangeStreamDropIndexDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID, ChangeStreamDocumentOperationDescription {
    /** Describes the type of operation represented in this change notification */
    operationType: 'dropIndexes';
}

/** @public */
export declare type ChangeStreamEvents<TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>> = {
    resumeTokenChanged(token: ResumeToken): void;
    init(response: any): void;
    more(response?: any): void;
    response(): void;
    end(): void;
    error(error: Error): void;
    change(change: TChange): void;
} & AbstractCursorEvents;

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#insert-event
 */
export declare interface ChangeStreamInsertDocument<TSchema extends Document = Document> extends ChangeStreamDocumentCommon, ChangeStreamDocumentKey<TSchema>, ChangeStreamDocumentCollectionUUID {
    /** Describes the type of operation represented in this change notification */
    operationType: 'insert';
    /** This key will contain the document being inserted */
    fullDocument: TSchema;
    /** Namespace the insert event occurred on */
    ns: ChangeStreamNameSpace;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#invalidate-event
 */
export declare interface ChangeStreamInvalidateDocument extends ChangeStreamDocumentCommon {
    /** Describes the type of operation represented in this change notification */
    operationType: 'invalidate';
}

/** @public */
export declare interface ChangeStreamNameSpace {
    db: string;
    coll: string;
}

/**
 * Options that can be passed to a ChangeStream. Note that startAfter, resumeAfter, and startAtOperationTime are all mutually exclusive, and the server will error if more than one is specified.
 * @public
 */
export declare interface ChangeStreamOptions extends AggregateOptions {
    /**
     * Allowed values: 'updateLookup', 'whenAvailable', 'required'.
     *
     * When set to 'updateLookup', the change notification for partial updates
     * will include both a delta describing the changes to the document as well
     * as a copy of the entire document that was changed from some time after
     * the change occurred.
     *
     * When set to 'whenAvailable', configures the change stream to return the
     * post-image of the modified document for replace and update change events
     * if the post-image for this event is available.
     *
     * When set to 'required', the same behavior as 'whenAvailable' except that
     * an error is raised if the post-image is not available.
     */
    fullDocument?: string;
    /**
     * Allowed values: 'whenAvailable', 'required', 'off'.
     *
     * The default is to not send a value, which is equivalent to 'off'.
     *
     * When set to 'whenAvailable', configures the change stream to return the
     * pre-image of the modified document for replace, update, and delete change
     * events if it is available.
     *
     * When set to 'required', the same behavior as 'whenAvailable' except that
     * an error is raised if the pre-image is not available.
     */
    fullDocumentBeforeChange?: string;
    /** The maximum amount of time for the server to wait on new documents to satisfy a change stream query. */
    maxAwaitTimeMS?: number;
    /**
     * Allows you to start a changeStream after a specified event.
     * @see https://docs.mongodb.com/manual/changeStreams/#resumeafter-for-change-streams
     */
    resumeAfter?: ResumeToken;
    /**
     * Similar to resumeAfter, but will allow you to start after an invalidated event.
     * @see https://docs.mongodb.com/manual/changeStreams/#startafter-for-change-streams
     */
    startAfter?: ResumeToken;
    /** Will start the changeStream after the specified operationTime. */
    startAtOperationTime?: OperationTime;
    /**
     * The number of documents to return per batch.
     * @see https://docs.mongodb.com/manual/reference/command/aggregate
     */
    batchSize?: number;
    /**
     * When enabled, configures the change stream to include extra change events.
     *
     * - createIndexes
     * - dropIndexes
     * - modify
     * - create
     * - shardCollection
     * - reshardCollection
     * - refineCollectionShardKey
     */
    showExpandedEvents?: boolean;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export declare interface ChangeStreamRefineCollectionShardKeyDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID, ChangeStreamDocumentOperationDescription {
    /** Describes the type of operation represented in this change notification */
    operationType: 'refineCollectionShardKey';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#rename-event
 */
export declare interface ChangeStreamRenameDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID {
    /** Describes the type of operation represented in this change notification */
    operationType: 'rename';
    /** The new name for the `ns.coll` collection */
    to: {
        db: string;
        coll: string;
    };
    /** The "from" namespace that the rename occurred on */
    ns: ChangeStreamNameSpace;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#replace-event
 */
export declare interface ChangeStreamReplaceDocument<TSchema extends Document = Document> extends ChangeStreamDocumentCommon, ChangeStreamDocumentKey<TSchema> {
    /** Describes the type of operation represented in this change notification */
    operationType: 'replace';
    /** The fullDocument of a replace event represents the document after the insert of the replacement document */
    fullDocument: TSchema;
    /** Namespace the replace event occurred on */
    ns: ChangeStreamNameSpace;
    /**
     * Contains the pre-image of the modified or deleted document if the
     * pre-image is available for the change event and either 'required' or
     * 'whenAvailable' was specified for the 'fullDocumentBeforeChange' option
     * when creating the change stream. If 'whenAvailable' was specified but the
     * pre-image is unavailable, this will be explicitly set to null.
     */
    fullDocumentBeforeChange?: TSchema;
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export declare interface ChangeStreamReshardCollectionDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID, ChangeStreamDocumentOperationDescription {
    /** Describes the type of operation represented in this change notification */
    operationType: 'reshardCollection';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/
 */
export declare interface ChangeStreamShardCollectionDocument extends ChangeStreamDocumentCommon, ChangeStreamDocumentCollectionUUID, ChangeStreamDocumentOperationDescription {
    /** Describes the type of operation represented in this change notification */
    operationType: 'shardCollection';
}

/**
 * @public
 * @see https://www.mongodb.com/docs/manual/reference/change-events/#update-event
 */
export declare interface ChangeStreamUpdateDocument<TSchema extends Document = Document> extends ChangeStreamDocumentCommon, ChangeStreamDocumentKey<TSchema>, ChangeStreamDocumentCollectionUUID {
    /** Describes the type of operation represented in this change notification */
    operationType: 'update';
    /**
     * This is only set if `fullDocument` is set to `'updateLookup'`
     * Contains the point-in-time post-image of the modified document if the
     * post-image is available and either 'required' or 'whenAvailable' was
     * specified for the 'fullDocument' option when creating the change stream.
     */
    fullDocument?: TSchema;
    /** Contains a description of updated and removed fields in this operation */
    updateDescription: UpdateDescription<TSchema>;
    /** Namespace the update event occurred on */
    ns: ChangeStreamNameSpace;
    /**
     * Contains the pre-image of the modified or deleted document if the
     * pre-image is available for the change event and either 'required' or
     * 'whenAvailable' was specified for the 'fullDocumentBeforeChange' option
     * when creating the change stream. If 'whenAvailable' was specified but the
     * pre-image is unavailable, this will be explicitly set to null.
     */
    fullDocumentBeforeChange?: TSchema;
}

/** @public */
export declare interface ClientMetadata {
    driver: {
        name: string;
        version: string;
    };
    os: {
        type: string;
        name: NodeJS.Platform;
        architecture: string;
        version: string;
    };
    platform: string;
    version?: string;
    application?: {
        name: string;
    };
}

/** @public */
export declare interface ClientMetadataOptions {
    driverInfo?: {
        name?: string;
        version?: string;
        platform?: string;
    };
    appName?: string;
}

/**
 * A class representing a client session on the server
 *
 * NOTE: not meant to be instantiated directly.
 * @public
 */
export declare class ClientSession extends TypedEventEmitter<ClientSessionEvents> {
    /* Excluded from this release type: client */
    /* Excluded from this release type: sessionPool */
    hasEnded: boolean;
    clientOptions?: MongoOptions;
    supports: {
        causalConsistency: boolean;
    };
    clusterTime?: ClusterTime;
    operationTime?: Timestamp;
    explicit: boolean;
    /* Excluded from this release type: owner */
    defaultTransactionOptions: TransactionOptions;
    transaction: Transaction;
    /* Excluded from this release type: [kServerSession] */
    /* Excluded from this release type: [kSnapshotTime] */
    /* Excluded from this release type: [kSnapshotEnabled] */
    /* Excluded from this release type: [kPinnedConnection] */
    /* Excluded from this release type: [kTxnNumberIncrement] */
    /* Excluded from this release type: __constructor */
    /** The server id associated with this session */
    get id(): ServerSessionId | undefined;
    get serverSession(): ServerSession;
    /** Whether or not this session is configured for snapshot reads */
    get snapshotEnabled(): boolean;
    get loadBalanced(): boolean;
    /* Excluded from this release type: pinnedConnection */
    /* Excluded from this release type: pin */
    /* Excluded from this release type: unpin */
    get isPinned(): boolean;
    /**
     * Ends this session on the server
     *
     * @param options - Optional settings. Currently reserved for future use
     * @param callback - Optional callback for completion of this operation
     */
    endSession(): Promise<void>;
    endSession(options: EndSessionOptions): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    endSession(callback: Callback<void>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    endSession(options: EndSessionOptions, callback: Callback<void>): void;
    /**
     * Advances the operationTime for a ClientSession.
     *
     * @param operationTime - the `BSON.Timestamp` of the operation type it is desired to advance to
     */
    advanceOperationTime(operationTime: Timestamp): void;
    /**
     * Advances the clusterTime for a ClientSession to the provided clusterTime of another ClientSession
     *
     * @param clusterTime - the $clusterTime returned by the server from another session in the form of a document containing the `BSON.Timestamp` clusterTime and signature
     */
    advanceClusterTime(clusterTime: ClusterTime): void;
    /**
     * Used to determine if this session equals another
     *
     * @param session - The session to compare to
     */
    equals(session: ClientSession): boolean;
    /**
     * Increment the transaction number on the internal ServerSession
     *
     * @privateRemarks
     * This helper increments a value stored on the client session that will be
     * added to the serverSession's txnNumber upon applying it to a command.
     * This is because the serverSession is lazily acquired after a connection is obtained
     */
    incrementTransactionNumber(): void;
    /** @returns whether this session is currently in a transaction or not */
    inTransaction(): boolean;
    /**
     * Starts a new transaction with the given options.
     *
     * @param options - Options for the transaction
     */
    startTransaction(options?: TransactionOptions): void;
    /**
     * Commits the currently active transaction in this session.
     *
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    commitTransaction(): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    commitTransaction(callback: Callback<Document>): void;
    /**
     * Aborts the currently active transaction in this session.
     *
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    abortTransaction(): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    abortTransaction(callback: Callback<Document>): void;
    /**
     * This is here to ensure that ClientSession is never serialized to BSON.
     */
    toBSON(): never;
    /**
     * Runs a provided callback within a transaction, retrying either the commitTransaction operation
     * or entire transaction as needed (and when the error permits) to better ensure that
     * the transaction can complete successfully.
     *
     * **IMPORTANT:** This method requires the user to return a Promise, and `await` all operations.
     * Any callbacks that do not return a Promise will result in undefined behavior.
     *
     * @remarks
     * This function:
     * - Will return the command response from the final commitTransaction if every operation is successful (can be used as a truthy object)
     * - Will return `undefined` if the transaction is explicitly aborted with `await session.abortTransaction()`
     * - Will throw if one of the operations throws or `throw` statement is used inside the `withTransaction` callback
     *
     * Checkout a descriptive example here:
     * @see https://www.mongodb.com/developer/quickstart/node-transactions/
     *
     * @param fn - callback to run within a transaction
     * @param options - optional settings for the transaction
     * @returns A raw command response or undefined
     */
    withTransaction<T = void>(fn: WithTransactionCallback<T>, options?: TransactionOptions): Promise<Document | undefined>;
}

/** @public */
export declare type ClientSessionEvents = {
    ended(session: ClientSession): void;
};

/** @public */
export declare interface ClientSessionOptions {
    /** Whether causal consistency should be enabled on this session */
    causalConsistency?: boolean;
    /** Whether all read operations should be read from the same snapshot for this session (NOTE: not compatible with `causalConsistency=true`) */
    snapshot?: boolean;
    /** The default TransactionOptions to use for transactions started on this session. */
    defaultTransactionOptions?: TransactionOptions;
    /* Excluded from this release type: owner */
    /* Excluded from this release type: explicit */
    /* Excluded from this release type: initialClusterTime */
}

/** @public */
export declare interface CloseOptions {
    force?: boolean;
}

/** @public
 * Configuration options for clustered collections
 * @see https://www.mongodb.com/docs/manual/core/clustered-collections/
 */
export declare interface ClusteredCollectionOptions extends Document {
    name?: string;
    key: Document;
    unique: boolean;
}

/** @public */
export declare interface ClusterTime {
    clusterTime: Timestamp;
    signature: {
        hash: Binary;
        keyId: Long;
    };
}

export { Code }

/** @public */
export declare interface CollationOptions {
    locale: string;
    caseLevel?: boolean;
    caseFirst?: string;
    strength?: number;
    numericOrdering?: boolean;
    alternate?: string;
    maxVariable?: string;
    backwards?: boolean;
    normalization?: boolean;
}

/**
 * The **Collection** class is an internal class that embodies a MongoDB collection
 * allowing for insert/find/update/delete and other command operation on that MongoDB collection.
 *
 * **COLLECTION Cannot directly be instantiated**
 * @public
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb';
 *
 * interface Pet {
 *   name: string;
 *   kind: 'dog' | 'cat' | 'fish';
 * }
 *
 * const client = new MongoClient('mongodb://localhost:27017');
 * const pets = client.db().collection<Pet>('pets');
 *
 * const petCursor = pets.find();
 *
 * for await (const pet of petCursor) {
 *   console.log(`${pet.name} is a ${pet.kind}!`);
 * }
 * ```
 */
export declare class Collection<TSchema extends Document = Document> {
    /* Excluded from this release type: s */
    /* Excluded from this release type: __constructor */
    /**
     * The name of the database this collection belongs to
     */
    get dbName(): string;
    /**
     * The name of this collection
     */
    get collectionName(): string;
    /**
     * The namespace of this collection, in the format `${this.dbName}.${this.collectionName}`
     */
    get namespace(): string;
    /**
     * The current readConcern of the collection. If not explicitly defined for
     * this collection, will be inherited from the parent DB
     */
    get readConcern(): ReadConcern | undefined;
    /**
     * The current readPreference of the collection. If not explicitly defined for
     * this collection, will be inherited from the parent DB
     */
    get readPreference(): ReadPreference | undefined;
    get bsonOptions(): BSONSerializeOptions;
    /**
     * The current writeConcern of the collection. If not explicitly defined for
     * this collection, will be inherited from the parent DB
     */
    get writeConcern(): WriteConcern | undefined;
    /** The current index hint for the collection */
    get hint(): Hint | undefined;
    set hint(v: Hint | undefined);
    /**
     * Inserts a single document into MongoDB. If documents passed in do not contain the **_id** field,
     * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
     * can be overridden by setting the **forceServerObjectId** flag.
     *
     * @param doc - The document to insert
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    insertOne(doc: OptionalUnlessRequiredId<TSchema>): Promise<InsertOneResult<TSchema>>;
    insertOne(doc: OptionalUnlessRequiredId<TSchema>, options: InsertOneOptions): Promise<InsertOneResult<TSchema>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    insertOne(doc: OptionalUnlessRequiredId<TSchema>, callback: Callback<InsertOneResult<TSchema>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    insertOne(doc: OptionalUnlessRequiredId<TSchema>, options: InsertOneOptions, callback: Callback<InsertOneResult<TSchema>>): void;
    /**
     * Inserts an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
     * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
     * can be overridden by setting the **forceServerObjectId** flag.
     *
     * @param docs - The documents to insert
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    insertMany(docs: OptionalUnlessRequiredId<TSchema>[]): Promise<InsertManyResult<TSchema>>;
    insertMany(docs: OptionalUnlessRequiredId<TSchema>[], options: BulkWriteOptions): Promise<InsertManyResult<TSchema>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    insertMany(docs: OptionalUnlessRequiredId<TSchema>[], callback: Callback<InsertManyResult<TSchema>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    insertMany(docs: OptionalUnlessRequiredId<TSchema>[], options: BulkWriteOptions, callback: Callback<InsertManyResult<TSchema>>): void;
    /**
     * Perform a bulkWrite operation without a fluent API
     *
     * Legal operation types are
     * - `insertOne`
     * - `replaceOne`
     * - `updateOne`
     * - `updateMany`
     * - `deleteOne`
     * - `deleteMany`
     *
     * Please note that raw operations are no longer accepted as of driver version 4.0.
     *
     * If documents passed in do not contain the **_id** field,
     * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
     * can be overridden by setting the **forceServerObjectId** flag.
     *
     * @param operations - Bulk operations to perform
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     * @throws MongoDriverError if operations is not an array
     */
    bulkWrite(operations: AnyBulkWriteOperation<TSchema>[]): Promise<BulkWriteResult>;
    bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], options: BulkWriteOptions): Promise<BulkWriteResult>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], callback: Callback<BulkWriteResult>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], options: BulkWriteOptions, callback: Callback<BulkWriteResult>): void;
    /**
     * Update a single document in a collection
     *
     * @param filter - The filter used to select the document to update
     * @param update - The update operations to be applied to the document
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>): Promise<UpdateResult>;
    updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>, options: UpdateOptions): Promise<UpdateResult>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>, callback: Callback<UpdateResult>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema> | Partial<TSchema>, options: UpdateOptions, callback: Callback<UpdateResult>): void;
    /**
     * Replace a document in a collection with another document
     *
     * @param filter - The filter used to select the document to replace
     * @param replacement - The Document that replaces the matching document
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>): Promise<UpdateResult | Document>;
    replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: ReplaceOptions): Promise<UpdateResult | Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, callback: Callback<UpdateResult | Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    replaceOne(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: ReplaceOptions, callback: Callback<UpdateResult | Document>): void;
    /**
     * Update multiple documents in a collection
     *
     * @param filter - The filter used to select the documents to update
     * @param update - The update operations to be applied to the documents
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<UpdateResult | Document>;
    updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: UpdateOptions): Promise<UpdateResult | Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, callback: Callback<UpdateResult | Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: UpdateOptions, callback: Callback<UpdateResult | Document>): void;
    /**
     * Delete a document from a collection
     *
     * @param filter - The filter used to select the document to remove
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    deleteOne(filter: Filter<TSchema>): Promise<DeleteResult>;
    deleteOne(filter: Filter<TSchema>, options: DeleteOptions): Promise<DeleteResult>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    deleteOne(filter: Filter<TSchema>, callback: Callback<DeleteResult>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    deleteOne(filter: Filter<TSchema>, options: DeleteOptions, callback?: Callback<DeleteResult>): void;
    /**
     * Delete multiple documents from a collection
     *
     * @param filter - The filter used to select the documents to remove
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    deleteMany(filter: Filter<TSchema>): Promise<DeleteResult>;
    deleteMany(filter: Filter<TSchema>, options: DeleteOptions): Promise<DeleteResult>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    deleteMany(filter: Filter<TSchema>, callback: Callback<DeleteResult>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    deleteMany(filter: Filter<TSchema>, options: DeleteOptions, callback: Callback<DeleteResult>): void;
    /**
     * Rename the collection.
     *
     * @remarks
     * This operation does not inherit options from the Db or MongoClient.
     *
     * @param newName - New name of of the collection.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    rename(newName: string): Promise<Collection>;
    rename(newName: string, options: RenameOptions): Promise<Collection>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    rename(newName: string, callback: Callback<Collection>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    rename(newName: string, options: RenameOptions, callback: Callback<Collection>): void;
    /**
     * Drop the collection from the database, removing it permanently. New accesses will create a new collection.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    drop(): Promise<boolean>;
    drop(options: DropCollectionOptions): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    drop(callback: Callback<boolean>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    drop(options: DropCollectionOptions, callback: Callback<boolean>): void;
    /**
     * Fetches the first document that matches the filter
     *
     * @param filter - Query for find Operation
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    findOne(): Promise<WithId<TSchema> | null>;
    findOne(filter: Filter<TSchema>): Promise<WithId<TSchema> | null>;
    findOne(filter: Filter<TSchema>, options: FindOptions): Promise<WithId<TSchema> | null>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOne(callback: Callback<WithId<TSchema> | null>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOne(filter: Filter<TSchema>, callback: Callback<WithId<TSchema> | null>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOne(filter: Filter<TSchema>, options: FindOptions, callback: Callback<WithId<TSchema> | null>): void;
    findOne<T = TSchema>(): Promise<T | null>;
    findOne<T = TSchema>(filter: Filter<TSchema>): Promise<T | null>;
    findOne<T = TSchema>(filter: Filter<TSchema>, options?: FindOptions): Promise<T | null>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOne<T = TSchema>(callback: Callback<T | null>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOne<T = TSchema>(filter: Filter<TSchema>, options?: FindOptions, callback?: Callback<T | null>): void;
    /**
     * Creates a cursor for a filter that can be used to iterate over results from MongoDB
     *
     * @param filter - The filter predicate. If unspecified, then all documents in the collection will match the predicate
     */
    find(): FindCursor<WithId<TSchema>>;
    find(filter: Filter<TSchema>, options?: FindOptions): FindCursor<WithId<TSchema>>;
    find<T extends Document>(filter: Filter<TSchema>, options?: FindOptions): FindCursor<T>;
    /**
     * Returns the options of the collection.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    options(): Promise<Document>;
    options(options: OperationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    options(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    options(options: OperationOptions, callback: Callback<Document>): void;
    /**
     * Returns if the collection is a capped collection
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    isCapped(): Promise<boolean>;
    isCapped(options: OperationOptions): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    isCapped(callback: Callback<boolean>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    isCapped(options: OperationOptions, callback: Callback<boolean>): void;
    /**
     * Creates an index on the db and collection collection.
     *
     * @param indexSpec - The field name or index specification to create an index for
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     *
     * @example
     * ```ts
     * const collection = client.db('foo').collection('bar');
     *
     * await collection.createIndex({ a: 1, b: -1 });
     *
     * // Alternate syntax for { c: 1, d: -1 } that ensures order of indexes
     * await collection.createIndex([ [c, 1], [d, -1] ]);
     *
     * // Equivalent to { e: 1 }
     * await collection.createIndex('e');
     *
     * // Equivalent to { f: 1, g: 1 }
     * await collection.createIndex(['f', 'g'])
     *
     * // Equivalent to { h: 1, i: -1 }
     * await collection.createIndex([ { h: 1 }, { i: -1 } ]);
     *
     * // Equivalent to { j: 1, k: -1, l: 2d }
     * await collection.createIndex(['j', ['k', -1], { l: '2d' }])
     * ```
     */
    createIndex(indexSpec: IndexSpecification): Promise<string>;
    createIndex(indexSpec: IndexSpecification, options: CreateIndexesOptions): Promise<string>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createIndex(indexSpec: IndexSpecification, callback: Callback<string>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createIndex(indexSpec: IndexSpecification, options: CreateIndexesOptions, callback: Callback<string>): void;
    /**
     * Creates multiple indexes in the collection, this method is only supported for
     * MongoDB 2.6 or higher. Earlier version of MongoDB will throw a command not supported
     * error.
     *
     * **Note**: Unlike {@link Collection#createIndex| createIndex}, this function takes in raw index specifications.
     * Index specifications are defined {@link http://docs.mongodb.org/manual/reference/command/createIndexes/| here}.
     *
     * @param indexSpecs - An array of index specifications to be created
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     *
     * @example
     * ```ts
     * const collection = client.db('foo').collection('bar');
     * await collection.createIndexes([
     *   // Simple index on field fizz
     *   {
     *     key: { fizz: 1 },
     *   }
     *   // wildcard index
     *   {
     *     key: { '$**': 1 }
     *   },
     *   // named index on darmok and jalad
     *   {
     *     key: { darmok: 1, jalad: -1 }
     *     name: 'tanagra'
     *   }
     * ]);
     * ```
     */
    createIndexes(indexSpecs: IndexDescription[]): Promise<string[]>;
    createIndexes(indexSpecs: IndexDescription[], options: CreateIndexesOptions): Promise<string[]>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createIndexes(indexSpecs: IndexDescription[], callback: Callback<string[]>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createIndexes(indexSpecs: IndexDescription[], options: CreateIndexesOptions, callback: Callback<string[]>): void;
    /**
     * Drops an index from this collection.
     *
     * @param indexName - Name of the index to drop.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    dropIndex(indexName: string): Promise<Document>;
    dropIndex(indexName: string, options: DropIndexesOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropIndex(indexName: string, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropIndex(indexName: string, options: DropIndexesOptions, callback: Callback<Document>): void;
    /**
     * Drops all indexes from this collection.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    dropIndexes(): Promise<Document>;
    dropIndexes(options: DropIndexesOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropIndexes(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropIndexes(options: DropIndexesOptions, callback: Callback<Document>): void;
    /**
     * Get the list of all indexes information for the collection.
     *
     * @param options - Optional settings for the command
     */
    listIndexes(options?: ListIndexesOptions): ListIndexesCursor;
    /**
     * Checks if one or more indexes exist on the collection, fails on first non-existing index
     *
     * @param indexes - One or more index names to check.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    indexExists(indexes: string | string[]): Promise<boolean>;
    indexExists(indexes: string | string[], options: IndexInformationOptions): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexExists(indexes: string | string[], callback: Callback<boolean>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexExists(indexes: string | string[], options: IndexInformationOptions, callback: Callback<boolean>): void;
    /**
     * Retrieves this collections index info.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    indexInformation(): Promise<Document>;
    indexInformation(options: IndexInformationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexInformation(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexInformation(options: IndexInformationOptions, callback: Callback<Document>): void;
    /**
     * Gets an estimate of the count of documents in a collection using collection metadata.
     * This will always run a count command on all server versions.
     *
     * due to an oversight in versions 5.0.0-5.0.8 of MongoDB, the count command,
     * which estimatedDocumentCount uses in its implementation, was not included in v1 of
     * the Stable API, and so users of the Stable API with estimatedDocumentCount are
     * recommended to upgrade their server version to 5.0.9+ or set apiStrict: false to avoid
     * encountering errors.
     *
     * @see {@link https://www.mongodb.com/docs/manual/reference/command/count/#behavior|Count: Behavior}
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    estimatedDocumentCount(): Promise<number>;
    estimatedDocumentCount(options: EstimatedDocumentCountOptions): Promise<number>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    estimatedDocumentCount(callback: Callback<number>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    estimatedDocumentCount(options: EstimatedDocumentCountOptions, callback: Callback<number>): void;
    /**
     * Gets the number of documents matching the filter.
     * For a fast count of the total documents in a collection see {@link Collection#estimatedDocumentCount| estimatedDocumentCount}.
     * **Note**: When migrating from {@link Collection#count| count} to {@link Collection#countDocuments| countDocuments}
     * the following query operators must be replaced:
     *
     * | Operator | Replacement |
     * | -------- | ----------- |
     * | `$where`   | [`$expr`][1] |
     * | `$near`    | [`$geoWithin`][2] with [`$center`][3] |
     * | `$nearSphere` | [`$geoWithin`][2] with [`$centerSphere`][4] |
     *
     * [1]: https://docs.mongodb.com/manual/reference/operator/query/expr/
     * [2]: https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
     * [3]: https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
     * [4]: https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
     *
     * @param filter - The filter for the count
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     *
     * @see https://docs.mongodb.com/manual/reference/operator/query/expr/
     * @see https://docs.mongodb.com/manual/reference/operator/query/geoWithin/
     * @see https://docs.mongodb.com/manual/reference/operator/query/center/#op._S_center
     * @see https://docs.mongodb.com/manual/reference/operator/query/centerSphere/#op._S_centerSphere
     */
    countDocuments(): Promise<number>;
    countDocuments(filter: Filter<TSchema>): Promise<number>;
    countDocuments(filter: Filter<TSchema>, options: CountDocumentsOptions): Promise<number>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    countDocuments(callback: Callback<number>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    countDocuments(filter: Filter<TSchema>, callback: Callback<number>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    countDocuments(filter: Filter<TSchema>, options: CountDocumentsOptions, callback: Callback<number>): void;
    /**
     * The distinct command returns a list of distinct values for the given key across a collection.
     *
     * @param key - Field of the document to find distinct values for
     * @param filter - The filter for filtering the set of documents to which we apply the distinct filter.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    distinct<Key extends keyof WithId<TSchema>>(key: Key): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
    distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
    distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>, options: DistinctOptions): Promise<Array<Flatten<WithId<TSchema>[Key]>>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    distinct<Key extends keyof WithId<TSchema>>(key: Key, callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>, callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    distinct<Key extends keyof WithId<TSchema>>(key: Key, filter: Filter<TSchema>, options: DistinctOptions, callback: Callback<Array<Flatten<WithId<TSchema>[Key]>>>): void;
    distinct(key: string): Promise<any[]>;
    distinct(key: string, filter: Filter<TSchema>): Promise<any[]>;
    distinct(key: string, filter: Filter<TSchema>, options: DistinctOptions): Promise<any[]>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    distinct(key: string, callback: Callback<any[]>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    distinct(key: string, filter: Filter<TSchema>, callback: Callback<any[]>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    distinct(key: string, filter: Filter<TSchema>, options: DistinctOptions, callback: Callback<any[]>): void;
    /**
     * Retrieve all the indexes on the collection.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    indexes(): Promise<Document[]>;
    indexes(options: IndexInformationOptions): Promise<Document[]>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexes(callback: Callback<Document[]>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexes(options: IndexInformationOptions, callback: Callback<Document[]>): void;
    /**
     * Get all the collection statistics.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    stats(): Promise<CollStats>;
    stats(options: CollStatsOptions): Promise<CollStats>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    stats(callback: Callback<CollStats>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    stats(options: CollStatsOptions, callback: Callback<CollStats>): void;
    /**
     * Find a document and delete it in one atomic operation. Requires a write lock for the duration of the operation.
     *
     * @param filter - The filter used to select the document to remove
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    findOneAndDelete(filter: Filter<TSchema>): Promise<ModifyResult<TSchema>>;
    findOneAndDelete(filter: Filter<TSchema>, options: FindOneAndDeleteOptions): Promise<ModifyResult<TSchema>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOneAndDelete(filter: Filter<TSchema>, callback: Callback<ModifyResult<TSchema>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOneAndDelete(filter: Filter<TSchema>, options: FindOneAndDeleteOptions, callback: Callback<ModifyResult<TSchema>>): void;
    /**
     * Find a document and replace it in one atomic operation. Requires a write lock for the duration of the operation.
     *
     * @param filter - The filter used to select the document to replace
     * @param replacement - The Document that replaces the matching document
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>): Promise<ModifyResult<TSchema>>;
    findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: FindOneAndReplaceOptions): Promise<ModifyResult<TSchema>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, callback: Callback<ModifyResult<TSchema>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOneAndReplace(filter: Filter<TSchema>, replacement: WithoutId<TSchema>, options: FindOneAndReplaceOptions, callback: Callback<ModifyResult<TSchema>>): void;
    /**
     * Find a document and update it in one atomic operation. Requires a write lock for the duration of the operation.
     *
     * @param filter - The filter used to select the document to update
     * @param update - Update operations to be performed on the document
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<ModifyResult<TSchema>>;
    findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: FindOneAndUpdateOptions): Promise<ModifyResult<TSchema>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, callback: Callback<ModifyResult<TSchema>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: FindOneAndUpdateOptions, callback: Callback<ModifyResult<TSchema>>): void;
    /**
     * Execute an aggregation framework pipeline against the collection, needs MongoDB \>= 2.2
     *
     * @param pipeline - An array of aggregation pipelines to execute
     * @param options - Optional settings for the command
     */
    aggregate<T extends Document = Document>(pipeline?: Document[], options?: AggregateOptions): AggregationCursor<T>;
    /**
     * Create a new Change Stream, watching for new changes (insertions, updates, replacements, deletions, and invalidations) in this collection.
     *
     * @remarks
     * watch() accepts two generic arguments for distinct use cases:
     * - The first is to override the schema that may be defined for this specific collection
     * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
     * @example
     * By just providing the first argument I can type the change to be `ChangeStreamDocument<{ _id: number }>`
     * ```ts
     * collection.watch<{ _id: number }>()
     *   .on('change', change => console.log(change._id.toFixed(4)));
     * ```
     *
     * @example
     * Passing a second argument provides a way to reflect the type changes caused by an advanced pipeline.
     * Here, we are using a pipeline to have MongoDB filter for insert changes only and add a comment.
     * No need start from scratch on the ChangeStreamInsertDocument type!
     * By using an intersection we can save time and ensure defaults remain the same type!
     * ```ts
     * collection
     *   .watch<Schema, ChangeStreamInsertDocument<Schema> & { comment: string }>([
     *     { $addFields: { comment: 'big changes' } },
     *     { $match: { operationType: 'insert' } }
     *   ])
     *   .on('change', change => {
     *     change.comment.startsWith('big');
     *     change.operationType === 'insert';
     *     // No need to narrow in code because the generics did that for us!
     *     expectType<Schema>(change.fullDocument);
     *   });
     * ```
     *
     * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
     * @param options - Optional settings for the command
     * @typeParam TLocal - Type of the data being detected by the change stream
     * @typeParam TChange - Type of the whole change stream document emitted
     */
    watch<TLocal extends Document = TSchema, TChange extends Document = ChangeStreamDocument<TLocal>>(pipeline?: Document[], options?: ChangeStreamOptions): ChangeStream<TLocal, TChange>;
    /**
     * Run Map Reduce across a collection. Be aware that the inline option for out will return an array of results not a collection.
     *
     * @deprecated collection.mapReduce is deprecated. Use the aggregation pipeline instead. Visit https://docs.mongodb.com/manual/reference/map-reduce-to-aggregation-pipeline for more information on how to translate map-reduce operations to the aggregation pipeline.
     * @param map - The mapping function.
     * @param reduce - The reduce function.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>): Promise<Document | Document[]>;
    mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>, options: MapReduceOptions<TKey, TValue>): Promise<Document | Document[]>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>, callback: Callback<Document | Document[]>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    mapReduce<TKey = any, TValue = any>(map: string | MapFunction<TSchema>, reduce: string | ReduceFunction<TKey, TValue>, options: MapReduceOptions<TKey, TValue>, callback: Callback<Document | Document[]>): void;
    /**
     * Initiate an Out of order batch write operation. All operations will be buffered into insert/update/remove commands executed out of order.
     *
     * @throws MongoNotConnectedError
     * @remarks
     * **NOTE:** MongoClient must be connected prior to calling this method due to a known limitation in this legacy implementation.
     * However, `collection.bulkWrite()` provides an equivalent API that does not require prior connecting.
     */
    initializeUnorderedBulkOp(options?: BulkWriteOptions): UnorderedBulkOperation;
    /**
     * Initiate an In order bulk write operation. Operations will be serially executed in the order they are added, creating a new operation for each switch in types.
     *
     * @throws MongoNotConnectedError
     * @remarks
     * **NOTE:** MongoClient must be connected prior to calling this method due to a known limitation in this legacy implementation.
     * However, `collection.bulkWrite()` provides an equivalent API that does not require prior connecting.
     */
    initializeOrderedBulkOp(options?: BulkWriteOptions): OrderedBulkOperation;
    /** Get the db scoped logger */
    getLogger(): Logger;
    get logger(): Logger;
    /**
     * Inserts a single document or a an array of documents into MongoDB. If documents passed in do not contain the **_id** field,
     * one will be added to each of the documents missing it by the driver, mutating the document. This behavior
     * can be overridden by setting the **forceServerObjectId** flag.
     *
     * @deprecated Use insertOne, insertMany or bulkWrite instead. Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance
     * @param docs - The documents to insert
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    insert(docs: OptionalUnlessRequiredId<TSchema>[], options: BulkWriteOptions, callback: Callback<InsertManyResult<TSchema>>): Promise<InsertManyResult<TSchema>> | void;
    /**
     * Updates documents.
     *
     * @deprecated use updateOne, updateMany or bulkWrite. Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance
     * @param filter - The filter for the update operation.
     * @param update - The update operations to be applied to the documents
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    update(filter: Filter<TSchema>, update: UpdateFilter<TSchema>, options: UpdateOptions, callback: Callback<Document>): Promise<UpdateResult> | void;
    /**
     * Remove documents.
     *
     * @deprecated use deleteOne, deleteMany or bulkWrite. Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance
     * @param filter - The filter for the remove operation.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    remove(filter: Filter<TSchema>, options: DeleteOptions, callback: Callback): Promise<DeleteResult> | void;
    /**
     * An estimated count of matching documents in the db to a filter.
     *
     * **NOTE:** This method has been deprecated, since it does not provide an accurate count of the documents
     * in a collection. To obtain an accurate count of documents in the collection, use {@link Collection#countDocuments| countDocuments}.
     * To obtain an estimated count of all documents in the collection, use {@link Collection#estimatedDocumentCount| estimatedDocumentCount}.
     *
     * @deprecated use {@link Collection#countDocuments| countDocuments} or {@link Collection#estimatedDocumentCount| estimatedDocumentCount} instead
     *
     * @param filter - The filter for the count.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    count(): Promise<number>;
    count(filter: Filter<TSchema>): Promise<number>;
    count(filter: Filter<TSchema>, options: CountOptions): Promise<number>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    count(callback: Callback<number>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    count(filter: Filter<TSchema>, callback: Callback<number>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    count(filter: Filter<TSchema>, options: CountOptions, callback: Callback<number>): Promise<number> | void;
}

/** @public */
export declare interface CollectionInfo extends Document {
    name: string;
    type?: string;
    options?: Document;
    info?: {
        readOnly?: false;
        uuid?: Binary;
    };
    idIndex?: Document;
}

/** @public */
export declare interface CollectionOptions extends BSONSerializeOptions, WriteConcernOptions, LoggerOptions {
    /**
     * @deprecated Use readPreference instead
     */
    slaveOk?: boolean;
    /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
    readConcern?: ReadConcernLike;
    /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
    readPreference?: ReadPreferenceLike;
}

/* Excluded from this release type: CollectionPrivate */

/**
 * @public
 * @see https://docs.mongodb.org/manual/reference/command/collStats/
 */
export declare interface CollStats extends Document {
    /** Namespace */
    ns: string;
    /** Number of documents */
    count: number;
    /** Collection size in bytes */
    size: number;
    /** Average object size in bytes */
    avgObjSize: number;
    /** (Pre)allocated space for the collection in bytes */
    storageSize: number;
    /** Number of extents (contiguously allocated chunks of datafile space) */
    numExtents: number;
    /** Number of indexes */
    nindexes: number;
    /** Size of the most recently created extent in bytes */
    lastExtentSize: number;
    /** Padding can speed up updates if documents grow */
    paddingFactor: number;
    /** A number that indicates the user-set flags on the collection. userFlags only appears when using the mmapv1 storage engine */
    userFlags?: number;
    /** Total index size in bytes */
    totalIndexSize: number;
    /** Size of specific indexes in bytes */
    indexSizes: {
        _id_: number;
        [index: string]: number;
    };
    /** `true` if the collection is capped */
    capped: boolean;
    /** The maximum number of documents that may be present in a capped collection */
    max: number;
    /** The maximum size of a capped collection */
    maxSize: number;
    /** This document contains data reported directly by the WiredTiger engine and other data for internal diagnostic use */
    wiredTiger?: WiredTigerData;
    /** The fields in this document are the names of the indexes, while the values themselves are documents that contain statistics for the index provided by the storage engine */
    indexDetails?: any;
    ok: number;
    /** The amount of storage available for reuse. The scale argument affects this value. */
    freeStorageSize?: number;
    /** An array that contains the names of the indexes that are currently being built on the collection */
    indexBuilds?: number;
    /** The sum of the storageSize and totalIndexSize. The scale argument affects this value */
    totalSize: number;
    /** The scale value used by the command. */
    scaleFactor: number;
}

/** @public */
export declare interface CollStatsOptions extends CommandOperationOptions {
    /** Divide the returned sizes by scale value. */
    scale?: number;
}

/**
 * An event indicating the failure of a given command
 * @public
 * @category Event
 */
export declare class CommandFailedEvent {
    address: string;
    connectionId?: string | number;
    requestId: number;
    duration: number;
    commandName: string;
    failure: Error;
    serviceId?: ObjectId;
    /* Excluded from this release type: __constructor */
    get hasServiceId(): boolean;
}

/* Excluded from this release type: CommandOperation */

/** @public */
export declare interface CommandOperationOptions extends OperationOptions, WriteConcernOptions, ExplainOptions {
    /** @deprecated This option does nothing */
    fullResponse?: boolean;
    /** Specify a read concern and level for the collection. (only MongoDB 3.2 or higher supported) */
    readConcern?: ReadConcernLike;
    /** Collation */
    collation?: CollationOptions;
    maxTimeMS?: number;
    /**
     * Comment to apply to the operation.
     *
     * In server versions pre-4.4, 'comment' must be string.  A server
     * error will be thrown if any other type is provided.
     *
     * In server versions 4.4 and above, 'comment' can be any valid BSON type.
     */
    comment?: unknown;
    /** Should retry failed writes */
    retryWrites?: boolean;
    dbName?: string;
    authdb?: string;
    noResponse?: boolean;
}

/* Excluded from this release type: CommandOptions */

/**
 * An event indicating the start of a given
 * @public
 * @category Event
 */
export declare class CommandStartedEvent {
    commandObj?: Document;
    requestId: number;
    databaseName: string;
    commandName: string;
    command: Document;
    address: string;
    connectionId?: string | number;
    serviceId?: ObjectId;
    /* Excluded from this release type: __constructor */
    get hasServiceId(): boolean;
}

/**
 * An event indicating the success of a given command
 * @public
 * @category Event
 */
export declare class CommandSucceededEvent {
    address: string;
    connectionId?: string | number;
    requestId: number;
    duration: number;
    commandName: string;
    reply: unknown;
    serviceId?: ObjectId;
    /* Excluded from this release type: __constructor */
    get hasServiceId(): boolean;
}

/** @public */
export declare type CommonEvents = 'newListener' | 'removeListener';

/** @public */
export declare const Compressor: Readonly<{
    readonly none: 0;
    readonly snappy: 1;
    readonly zlib: 2;
    readonly zstd: 3;
}>;

/** @public */
export declare type Compressor = typeof Compressor[CompressorName];

/** @public */
export declare type CompressorName = keyof typeof Compressor;

/** @public */
export declare type Condition<T> = AlternativeType<T> | FilterOperators<AlternativeType<T>>;

/* Excluded from this release type: Connection */

/**
 * An event published when a connection is checked into the connection pool
 * @public
 * @category Event
 */
export declare class ConnectionCheckedInEvent extends ConnectionPoolMonitoringEvent {
    /** The id of the connection */
    connectionId: number | '<monitor>';
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a connection is checked out of the connection pool
 * @public
 * @category Event
 */
export declare class ConnectionCheckedOutEvent extends ConnectionPoolMonitoringEvent {
    /** The id of the connection */
    connectionId: number | '<monitor>';
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a request to check a connection out fails
 * @public
 * @category Event
 */
export declare class ConnectionCheckOutFailedEvent extends ConnectionPoolMonitoringEvent {
    /** The reason the attempt to check out failed */
    reason: AnyError | string;
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a request to check a connection out begins
 * @public
 * @category Event
 */
export declare class ConnectionCheckOutStartedEvent extends ConnectionPoolMonitoringEvent {
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a connection is closed
 * @public
 * @category Event
 */
export declare class ConnectionClosedEvent extends ConnectionPoolMonitoringEvent {
    /** The id of the connection */
    connectionId: number | '<monitor>';
    /** The reason the connection was closed */
    reason: string;
    serviceId?: ObjectId;
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a connection pool creates a new connection
 * @public
 * @category Event
 */
export declare class ConnectionCreatedEvent extends ConnectionPoolMonitoringEvent {
    /** A monotonically increasing, per-pool id for the newly created connection */
    connectionId: number | '<monitor>';
    /* Excluded from this release type: __constructor */
}

/** @public */
export declare type ConnectionEvents = {
    commandStarted(event: CommandStartedEvent): void;
    commandSucceeded(event: CommandSucceededEvent): void;
    commandFailed(event: CommandFailedEvent): void;
    clusterTimeReceived(clusterTime: Document): void;
    close(): void;
    message(message: any): void;
    pinned(pinType: string): void;
    unpinned(pinType: string): void;
};

/** @public */
export declare interface ConnectionOptions extends SupportedNodeConnectionOptions, StreamDescriptionOptions, ProxyOptions {
    id: number | '<monitor>';
    generation: number;
    hostAddress: HostAddress;
    autoEncrypter?: AutoEncrypter;
    serverApi?: ServerApi;
    monitorCommands: boolean;
    /* Excluded from this release type: connectionType */
    credentials?: MongoCredentials;
    connectTimeoutMS?: number;
    tls: boolean;
    keepAlive?: boolean;
    keepAliveInitialDelay?: number;
    noDelay?: boolean;
    socketTimeoutMS?: number;
    cancellationToken?: CancellationToken;
    metadata: ClientMetadata;
}

/* Excluded from this release type: ConnectionPool */

/**
 * An event published when a connection pool is cleared
 * @public
 * @category Event
 */
export declare class ConnectionPoolClearedEvent extends ConnectionPoolMonitoringEvent {
    /* Excluded from this release type: serviceId */
    interruptInUseConnections?: boolean;
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a connection pool is closed
 * @public
 * @category Event
 */
export declare class ConnectionPoolClosedEvent extends ConnectionPoolMonitoringEvent {
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a connection pool is created
 * @public
 * @category Event
 */
export declare class ConnectionPoolCreatedEvent extends ConnectionPoolMonitoringEvent {
    /** The options used to create this connection pool */
    options?: ConnectionPoolOptions;
    /* Excluded from this release type: __constructor */
}

/** @public */
export declare type ConnectionPoolEvents = {
    connectionPoolCreated(event: ConnectionPoolCreatedEvent): void;
    connectionPoolReady(event: ConnectionPoolReadyEvent): void;
    connectionPoolClosed(event: ConnectionPoolClosedEvent): void;
    connectionPoolCleared(event: ConnectionPoolClearedEvent): void;
    connectionCreated(event: ConnectionCreatedEvent): void;
    connectionReady(event: ConnectionReadyEvent): void;
    connectionClosed(event: ConnectionClosedEvent): void;
    connectionCheckOutStarted(event: ConnectionCheckOutStartedEvent): void;
    connectionCheckOutFailed(event: ConnectionCheckOutFailedEvent): void;
    connectionCheckedOut(event: ConnectionCheckedOutEvent): void;
    connectionCheckedIn(event: ConnectionCheckedInEvent): void;
} & Omit<ConnectionEvents, 'close' | 'message'>;

/* Excluded from this release type: ConnectionPoolMetrics */

/**
 * The base export class for all monitoring events published from the connection pool
 * @public
 * @category Event
 */
export declare class ConnectionPoolMonitoringEvent {
    /** A timestamp when the event was created  */
    time: Date;
    /** The address (host/port pair) of the pool */
    address: string;
    /* Excluded from this release type: __constructor */
}

/** @public */
export declare interface ConnectionPoolOptions extends Omit<ConnectionOptions, 'id' | 'generation'> {
    /** The maximum number of connections that may be associated with a pool at a given time. This includes in use and available connections. */
    maxPoolSize: number;
    /** The minimum number of connections that MUST exist at any moment in a single connection pool. */
    minPoolSize: number;
    /** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
    maxConnecting: number;
    /** The maximum amount of time a connection should remain idle in the connection pool before being marked idle. */
    maxIdleTimeMS: number;
    /** The maximum amount of time operation execution should wait for a connection to become available. The default is 0 which means there is no limit. */
    waitQueueTimeoutMS: number;
    /** If we are in load balancer mode. */
    loadBalanced: boolean;
    /* Excluded from this release type: minPoolSizeCheckFrequencyMS */
}

/**
 * An event published when a connection pool is ready
 * @public
 * @category Event
 */
export declare class ConnectionPoolReadyEvent extends ConnectionPoolMonitoringEvent {
    /* Excluded from this release type: __constructor */
}

/**
 * An event published when a connection is ready for use
 * @public
 * @category Event
 */
export declare class ConnectionReadyEvent extends ConnectionPoolMonitoringEvent {
    /** The id of the connection */
    connectionId: number | '<monitor>';
    /* Excluded from this release type: __constructor */
}

/** @public */
export declare interface ConnectOptions {
    readPreference?: ReadPreference;
}

/** @public */
export declare interface CountDocumentsOptions extends AggregateOptions {
    /** The number of documents to skip. */
    skip?: number;
    /** The maximum amounts to count before aborting. */
    limit?: number;
}

/** @public */
export declare interface CountOptions extends CommandOperationOptions {
    /** The number of documents to skip. */
    skip?: number;
    /** The maximum amounts to count before aborting. */
    limit?: number;
    /** Number of milliseconds to wait before aborting the query. */
    maxTimeMS?: number;
    /** An index name hint for the query. */
    hint?: string | Document;
}

/** @public */
export declare interface CreateCollectionOptions extends CommandOperationOptions {
    /** Returns an error if the collection does not exist */
    strict?: boolean;
    /** Create a capped collection */
    capped?: boolean;
    /** @deprecated Create an index on the _id field of the document. This option is deprecated in MongoDB 3.2+ and will be removed once no longer supported by the server. */
    autoIndexId?: boolean;
    /** The size of the capped collection in bytes */
    size?: number;
    /** The maximum number of documents in the capped collection */
    max?: number;
    /** Available for the MMAPv1 storage engine only to set the usePowerOf2Sizes and the noPadding flag */
    flags?: number;
    /** Allows users to specify configuration to the storage engine on a per-collection basis when creating a collection */
    storageEngine?: Document;
    /** Allows users to specify validation rules or expressions for the collection. For more information, see Document Validation */
    validator?: Document;
    /** Determines how strictly MongoDB applies the validation rules to existing documents during an update */
    validationLevel?: string;
    /** Determines whether to error on invalid documents or just warn about the violations but allow invalid documents to be inserted */
    validationAction?: string;
    /** Allows users to specify a default configuration for indexes when creating a collection */
    indexOptionDefaults?: Document;
    /** The name of the source collection or view from which to create the view. The name is not the full namespace of the collection or view (i.e., does not include the database name and implies the same database as the view to create) */
    viewOn?: string;
    /** An array that consists of the aggregation pipeline stage. Creates the view by applying the specified pipeline to the viewOn collection or view */
    pipeline?: Document[];
    /** A primary key factory function for generation of custom _id keys. */
    pkFactory?: PkFactory;
    /** A document specifying configuration options for timeseries collections. */
    timeseries?: TimeSeriesCollectionOptions;
    /** A document specifying configuration options for clustered collections. For MongoDB 5.3 and above. */
    clusteredIndex?: ClusteredCollectionOptions;
    /** The number of seconds after which a document in a timeseries or clustered collection expires. */
    expireAfterSeconds?: number;
    /** @experimental */
    encryptedFields?: Document;
    /**
     * If set, enables pre-update and post-update document events to be included for any
     * change streams that listen on this collection.
     */
    changeStreamPreAndPostImages?: {
        enabled: boolean;
    };
}

/** @public */
export declare interface CreateIndexesOptions extends CommandOperationOptions {
    /** Creates the index in the background, yielding whenever possible. */
    background?: boolean;
    /** Creates an unique index. */
    unique?: boolean;
    /** Override the autogenerated index name (useful if the resulting name is larger than 128 bytes) */
    name?: string;
    /** Creates a partial index based on the given filter object (MongoDB 3.2 or higher) */
    partialFilterExpression?: Document;
    /** Creates a sparse index. */
    sparse?: boolean;
    /** Allows you to expire data on indexes applied to a data (MongoDB 2.2 or higher) */
    expireAfterSeconds?: number;
    /** Allows users to configure the storage engine on a per-index basis when creating an index. (MongoDB 3.0 or higher) */
    storageEngine?: Document;
    /** (MongoDB 4.4. or higher) Specifies how many data-bearing members of a replica set, including the primary, must complete the index builds successfully before the primary marks the indexes as ready. This option accepts the same values for the "w" field in a write concern plus "votingMembers", which indicates all voting data-bearing nodes. */
    commitQuorum?: number | string;
    /** Specifies the index version number, either 0 or 1. */
    version?: number;
    weights?: Document;
    default_language?: string;
    language_override?: string;
    textIndexVersion?: number;
    '2dsphereIndexVersion'?: number;
    bits?: number;
    /** For geospatial indexes set the lower bound for the co-ordinates. */
    min?: number;
    /** For geospatial indexes set the high bound for the co-ordinates. */
    max?: number;
    bucketSize?: number;
    wildcardProjection?: Document;
    /** Specifies that the index should exist on the target collection but should not be used by the query planner when executing operations. (MongoDB 4.4 or higher) */
    hidden?: boolean;
}

/** @public */
export declare const CURSOR_FLAGS: readonly ["tailable", "oplogReplay", "noCursorTimeout", "awaitData", "exhaust", "partial"];

/** @public
 * @deprecated This interface is deprecated */
export declare interface CursorCloseOptions {
    /** Bypass calling killCursors when closing the cursor. */
    /** @deprecated  the skipKillCursors option is deprecated */
    skipKillCursors?: boolean;
}

/** @public */
export declare type CursorFlag = typeof CURSOR_FLAGS[number];

/** @public */
export declare interface CursorStreamOptions {
    /** A transformation method applied to each document emitted by the stream */
    transform?(this: void, doc: Document): Document;
}

/**
 * The **Db** class is a class that represents a MongoDB Database.
 * @public
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb';
 *
 * interface Pet {
 *   name: string;
 *   kind: 'dog' | 'cat' | 'fish';
 * }
 *
 * const client = new MongoClient('mongodb://localhost:27017');
 * const db = client.db();
 *
 * // Create a collection that validates our union
 * await db.createCollection<Pet>('pets', {
 *   validator: { $expr: { $in: ['$kind', ['dog', 'cat', 'fish']] } }
 * })
 * ```
 */
export declare class Db {
    /* Excluded from this release type: s */
    static SYSTEM_NAMESPACE_COLLECTION: string;
    static SYSTEM_INDEX_COLLECTION: string;
    static SYSTEM_PROFILE_COLLECTION: string;
    static SYSTEM_USER_COLLECTION: string;
    static SYSTEM_COMMAND_COLLECTION: string;
    static SYSTEM_JS_COLLECTION: string;
    /**
     * Creates a new Db instance
     *
     * @param client - The MongoClient for the database.
     * @param databaseName - The name of the database this instance represents.
     * @param options - Optional settings for Db construction
     */
    constructor(client: MongoClient, databaseName: string, options?: DbOptions);
    get databaseName(): string;
    get options(): DbOptions | undefined;
    /**
     * slaveOk specified
     * @deprecated Use secondaryOk instead
     */
    get slaveOk(): boolean;
    /**
     * Check if a secondary can be used (because the read preference is *not* set to primary)
     */
    get secondaryOk(): boolean;
    get readConcern(): ReadConcern | undefined;
    /**
     * The current readPreference of the Db. If not explicitly defined for
     * this Db, will be inherited from the parent MongoClient
     */
    get readPreference(): ReadPreference;
    get bsonOptions(): BSONSerializeOptions;
    get writeConcern(): WriteConcern | undefined;
    get namespace(): string;
    /**
     * Create a new collection on a server with the specified options. Use this to create capped collections.
     * More information about command options available at https://docs.mongodb.com/manual/reference/command/create/
     *
     * @param name - The name of the collection to create
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    createCollection<TSchema extends Document = Document>(name: string, options?: CreateCollectionOptions): Promise<Collection<TSchema>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createCollection<TSchema extends Document = Document>(name: string, callback: Callback<Collection<TSchema>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createCollection<TSchema extends Document = Document>(name: string, options: CreateCollectionOptions | undefined, callback: Callback<Collection<TSchema>>): void;
    /**
     * Execute a command
     *
     * @remarks
     * This command does not inherit options from the MongoClient.
     *
     * @param command - The command to run
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    command(command: Document): Promise<Document>;
    command(command: Document, options: RunCommandOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    command(command: Document, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    command(command: Document, options: RunCommandOptions, callback: Callback<Document>): void;
    /**
     * Execute an aggregation framework pipeline against the database, needs MongoDB \>= 3.6
     *
     * @param pipeline - An array of aggregation stages to be executed
     * @param options - Optional settings for the command
     */
    aggregate<T extends Document = Document>(pipeline?: Document[], options?: AggregateOptions): AggregationCursor<T>;
    /** Return the Admin db instance */
    admin(): Admin;
    /**
     * Returns a reference to a MongoDB Collection. If it does not exist it will be created implicitly.
     *
     * @param name - the collection name we wish to access.
     * @returns return the new Collection instance
     */
    collection<TSchema extends Document = Document>(name: string, options?: CollectionOptions): Collection<TSchema>;
    /**
     * Get all the db statistics.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    stats(): Promise<Document>;
    stats(options: DbStatsOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    stats(callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    stats(options: DbStatsOptions, callback: Callback<Document>): void;
    /**
     * List all collections of this database with optional filter
     *
     * @param filter - Query to filter collections by
     * @param options - Optional settings for the command
     */
    listCollections(filter: Document, options: Exclude<ListCollectionsOptions, 'nameOnly'> & {
        nameOnly: true;
    }): ListCollectionsCursor<Pick<CollectionInfo, 'name' | 'type'>>;
    listCollections(filter: Document, options: Exclude<ListCollectionsOptions, 'nameOnly'> & {
        nameOnly: false;
    }): ListCollectionsCursor<CollectionInfo>;
    listCollections<T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo = Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo>(filter?: Document, options?: ListCollectionsOptions): ListCollectionsCursor<T>;
    /**
     * Rename a collection.
     *
     * @remarks
     * This operation does not inherit options from the MongoClient.
     *
     * @param fromCollection - Name of current collection to rename
     * @param toCollection - New name of of the collection
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string): Promise<Collection<TSchema>>;
    renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string, options: RenameOptions): Promise<Collection<TSchema>>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string, callback: Callback<Collection<TSchema>>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    renameCollection<TSchema extends Document = Document>(fromCollection: string, toCollection: string, options: RenameOptions, callback: Callback<Collection<TSchema>>): void;
    /**
     * Drop a collection from the database, removing it permanently. New accesses will create a new collection.
     *
     * @param name - Name of collection to drop
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    dropCollection(name: string): Promise<boolean>;
    dropCollection(name: string, options: DropCollectionOptions): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropCollection(name: string, callback: Callback<boolean>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropCollection(name: string, options: DropCollectionOptions, callback: Callback<boolean>): void;
    /**
     * Drop a database, removing it permanently from the server.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    dropDatabase(): Promise<boolean>;
    dropDatabase(options: DropDatabaseOptions): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropDatabase(callback: Callback<boolean>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    dropDatabase(options: DropDatabaseOptions, callback: Callback<boolean>): void;
    /**
     * Fetch all collections for the current db.
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    collections(): Promise<Collection[]>;
    collections(options: ListCollectionsOptions): Promise<Collection[]>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    collections(callback: Callback<Collection[]>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    collections(options: ListCollectionsOptions, callback: Callback<Collection[]>): void;
    /**
     * Creates an index on the db and collection.
     *
     * @param name - Name of the collection to create the index on.
     * @param indexSpec - Specify the field to index, or an index specification
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    createIndex(name: string, indexSpec: IndexSpecification): Promise<string>;
    createIndex(name: string, indexSpec: IndexSpecification, options: CreateIndexesOptions): Promise<string>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createIndex(name: string, indexSpec: IndexSpecification, callback: Callback<string>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    createIndex(name: string, indexSpec: IndexSpecification, options: CreateIndexesOptions, callback: Callback<string>): void;
    /**
     * Add a user to the database
     *
     * @param username - The username for the new user
     * @param password - An optional password for the new user
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    addUser(username: string): Promise<Document>;
    addUser(username: string, password: string): Promise<Document>;
    addUser(username: string, options: AddUserOptions): Promise<Document>;
    addUser(username: string, password: string, options: AddUserOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, password: string, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, options: AddUserOptions, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    addUser(username: string, password: string, options: AddUserOptions, callback: Callback<Document>): void;
    /**
     * Remove a user from a database
     *
     * @param username - The username to remove
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    removeUser(username: string): Promise<boolean>;
    removeUser(username: string, options: RemoveUserOptions): Promise<boolean>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    removeUser(username: string, callback: Callback<boolean>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    removeUser(username: string, options: RemoveUserOptions, callback: Callback<boolean>): void;
    /**
     * Set the current profiling level of MongoDB
     *
     * @param level - The new profiling level (off, slow_only, all).
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    setProfilingLevel(level: ProfilingLevel): Promise<ProfilingLevel>;
    setProfilingLevel(level: ProfilingLevel, options: SetProfilingLevelOptions): Promise<ProfilingLevel>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    setProfilingLevel(level: ProfilingLevel, callback: Callback<ProfilingLevel>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    setProfilingLevel(level: ProfilingLevel, options: SetProfilingLevelOptions, callback: Callback<ProfilingLevel>): void;
    /**
     * Retrieve the current profiling Level for MongoDB
     *
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    profilingLevel(): Promise<string>;
    profilingLevel(options: ProfilingLevelOptions): Promise<string>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    profilingLevel(callback: Callback<string>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    profilingLevel(options: ProfilingLevelOptions, callback: Callback<string>): void;
    /**
     * Retrieves this collections index info.
     *
     * @param name - The name of the collection.
     * @param options - Optional settings for the command
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    indexInformation(name: string): Promise<Document>;
    indexInformation(name: string, options: IndexInformationOptions): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexInformation(name: string, callback: Callback<Document>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    indexInformation(name: string, options: IndexInformationOptions, callback: Callback<Document>): void;
    /**
     * Unref all sockets
     * @deprecated This function is deprecated and will be removed in the next major version.
     */
    unref(): void;
    /**
     * Create a new Change Stream, watching for new changes (insertions, updates,
     * replacements, deletions, and invalidations) in this database. Will ignore all
     * changes to system collections.
     *
     * @remarks
     * watch() accepts two generic arguments for distinct use cases:
     * - The first is to provide the schema that may be defined for all the collections within this database
     * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
     *
     * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
     * @param options - Optional settings for the command
     * @typeParam TSchema - Type of the data being detected by the change stream
     * @typeParam TChange - Type of the whole change stream document emitted
     */
    watch<TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>>(pipeline?: Document[], options?: ChangeStreamOptions): ChangeStream<TSchema, TChange>;
    /** Return the db logger */
    getLogger(): Logger;
    get logger(): Logger;
}

/* Excluded from this release type: DB_AGGREGATE_COLLECTION */

/** @public */
export declare interface DbOptions extends BSONSerializeOptions, WriteConcernOptions, LoggerOptions {
    /** If the database authentication is dependent on another databaseName. */
    authSource?: string;
    /** Force server to assign _id values instead of driver. */
    forceServerObjectId?: boolean;
    /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
    readPreference?: ReadPreferenceLike;
    /** A primary key factory object for generation of custom _id keys. */
    pkFactory?: PkFactory;
    /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
    readConcern?: ReadConcern;
    /** Should retry failed writes */
    retryWrites?: boolean;
}

/* Excluded from this release type: DbPrivate */
export { DBRef }

/** @public */
export declare interface DbStatsOptions extends CommandOperationOptions {
    /** Divide the returned sizes by scale value. */
    scale?: number;
}

export { Decimal128 }

/** @public */
export declare interface DeleteManyModel<TSchema extends Document = Document> {
    /** The filter to limit the deleted documents. */
    filter: Filter<TSchema>;
    /** Specifies a collation. */
    collation?: CollationOptions;
    /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
    hint?: Hint;
}

/** @public */
export declare interface DeleteOneModel<TSchema extends Document = Document> {
    /** The filter to limit the deleted documents. */
    filter: Filter<TSchema>;
    /** Specifies a collation. */
    collation?: CollationOptions;
    /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
    hint?: Hint;
}

/** @public */
export declare interface DeleteOptions extends CommandOperationOptions, WriteConcernOptions {
    /** If true, when an insert fails, don't execute the remaining writes. If false, continue with remaining inserts when one fails. */
    ordered?: boolean;
    /** Specifies the collation to use for the operation */
    collation?: CollationOptions;
    /** Specify that the update query should only consider plans using the hinted index */
    hint?: string | Document;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
    /** @deprecated use `removeOne` or `removeMany` to implicitly specify the limit */
    single?: boolean;
}

/** @public */
export declare interface DeleteResult {
    /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined. */
    acknowledged: boolean;
    /** The number of documents that were deleted */
    deletedCount: number;
}

/** @public */
export declare interface DeleteStatement {
    /** The query that matches documents to delete. */
    q: Document;
    /** The number of matching documents to delete. */
    limit: number;
    /** Specifies the collation to use for the operation. */
    collation?: CollationOptions;
    /** A document or string that specifies the index to use to support the query predicate. */
    hint?: Hint;
}

/* Excluded from this release type: deserialize */

/** @public */
export declare interface DestroyOptions {
    /** Force the destruction. */
    force: boolean;
}

/** @public */
export declare type DistinctOptions = CommandOperationOptions;

export { Document }

export { Double }

/** @public */
export declare interface DriverInfo {
    name?: string;
    version?: string;
    platform?: string;
}

/** @public */
export declare interface DropCollectionOptions extends CommandOperationOptions {
    /** @experimental */
    encryptedFields?: Document;
}

/** @public */
export declare type DropDatabaseOptions = CommandOperationOptions;

/** @public */
export declare type DropIndexesOptions = CommandOperationOptions;

/* Excluded from this release type: Encrypter */

/* Excluded from this release type: EncrypterOptions */

/** @public */
export declare interface EndSessionOptions {
    /* Excluded from this release type: error */
    force?: boolean;
    forceClear?: boolean;
}

/** TypeScript Omit (Exclude to be specific) does not work for objects with an "any" indexed type, and breaks discriminated unions @public */
export declare type EnhancedOmit<TRecordOrUnion, KeyUnion> = string extends keyof TRecordOrUnion ? TRecordOrUnion : TRecordOrUnion extends any ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>> : never;

/** @public */
export declare interface ErrorDescription extends Document {
    message?: string;
    errmsg?: string;
    $err?: string;
    errorLabels?: string[];
    errInfo?: Document;
}

/** @public */
export declare interface EstimatedDocumentCountOptions extends CommandOperationOptions {
    /**
     * The maximum amount of time to allow the operation to run.
     *
     * This option is sent only if the caller explicitly provides a value. The default is to not send a value.
     */
    maxTimeMS?: number;
}

/** @public */
export declare interface EvalOptions extends CommandOperationOptions {
    nolock?: boolean;
}

/** @public */
export declare type EventEmitterWithState = {
    /* Excluded from this release type: stateChanged */
};

/**
 * Event description type
 * @public
 */
export declare type EventsDescription = Record<string, GenericListener>;

/* Excluded from this release type: ExecutionResult */

/* Excluded from this release type: Explain */

/** @public */
export declare interface ExplainOptions {
    /** Specifies the verbosity mode for the explain output. */
    explain?: ExplainVerbosityLike;
}

/** @public */
export declare const ExplainVerbosity: Readonly<{
    readonly queryPlanner: "queryPlanner";
    readonly queryPlannerExtended: "queryPlannerExtended";
    readonly executionStats: "executionStats";
    readonly allPlansExecution: "allPlansExecution";
}>;

/** @public */
export declare type ExplainVerbosity = string;

/**
 * For backwards compatibility, true is interpreted as "allPlansExecution"
 * and false as "queryPlanner". Prior to server version 3.6, aggregate()
 * ignores the verbosity parameter and executes in "queryPlanner".
 * @public
 */
export declare type ExplainVerbosityLike = ExplainVerbosity | boolean;

/** A MongoDB filter can be some portion of the schema or a set of operators @public */
export declare type Filter<TSchema> = Partial<TSchema> | ({
    [Property in Join<NestedPaths<WithId<TSchema>, []>, '.'>]?: Condition<PropertyType<WithId<TSchema>, Property>>;
} & RootFilterOperators<WithId<TSchema>>);

/** @public */
export declare type FilterOperations<T> = T extends Record<string, any> ? {
    [key in keyof T]?: FilterOperators<T[key]>;
} : FilterOperators<T>;

/** @public */
export declare interface FilterOperators<TValue> extends NonObjectIdLikeDocument {
    $eq?: TValue;
    $gt?: TValue;
    $gte?: TValue;
    $in?: ReadonlyArray<TValue>;
    $lt?: TValue;
    $lte?: TValue;
    $ne?: TValue;
    $nin?: ReadonlyArray<TValue>;
    $not?: TValue extends string ? FilterOperators<TValue> | RegExp : FilterOperators<TValue>;
    /**
     * When `true`, `$exists` matches the documents that contain the field,
     * including documents where the field value is null.
     */
    $exists?: boolean;
    $type?: BSONType | BSONTypeAlias;
    $expr?: Record<string, any>;
    $jsonSchema?: Record<string, any>;
    $mod?: TValue extends number ? [number, number] : never;
    $regex?: TValue extends string ? RegExp | BSONRegExp | string : never;
    $options?: TValue extends string ? string : never;
    $geoIntersects?: {
        $geometry: Document;
    };
    $geoWithin?: Document;
    $near?: Document;
    $nearSphere?: Document;
    $maxDistance?: number;
    $all?: ReadonlyArray<any>;
    $elemMatch?: Document;
    $size?: TValue extends ReadonlyArray<any> ? number : never;
    $bitsAllClear?: BitwiseFilter;
    $bitsAllSet?: BitwiseFilter;
    $bitsAnyClear?: BitwiseFilter;
    $bitsAnySet?: BitwiseFilter;
    $rand?: Record<string, never>;
}

/** @public */
export declare type FinalizeFunction<TKey = ObjectId, TValue = Document> = (key: TKey, reducedValue: TValue) => TValue;

/** @public */
export declare class FindCursor<TSchema = any> extends AbstractCursor<TSchema> {
    /* Excluded from this release type: [kFilter] */
    /* Excluded from this release type: [kNumReturned] */
    /* Excluded from this release type: [kBuiltOptions] */
    /* Excluded from this release type: __constructor */
    clone(): FindCursor<TSchema>;
    map<T>(transform: (doc: TSchema) => T): FindCursor<T>;
    /* Excluded from this release type: _initialize */
    /* Excluded from this release type: _getMore */
    /**
     * Get the count of documents for this cursor
     * @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead
     */
    count(): Promise<number>;
    /** @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead. */
    count(options: CountOptions): Promise<number>;
    /** @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead. Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    count(callback: Callback<number>): void;
    /** @deprecated Use `collection.estimatedDocumentCount` or `collection.countDocuments` instead. Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    count(options: CountOptions, callback: Callback<number>): void;
    /** Execute the explain for the cursor */
    explain(): Promise<Document>;
    explain(verbosity?: ExplainVerbosityLike): Promise<Document>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    explain(callback: Callback): void;
    /** Set the cursor query */
    filter(filter: Document): this;
    /**
     * Set the cursor hint
     *
     * @param hint - If specified, then the query system will only consider plans using the hinted index.
     */
    hint(hint: Hint): this;
    /**
     * Set the cursor min
     *
     * @param min - Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find(). The $min specifies the lower bound for all keys of a specific index in order.
     */
    min(min: Document): this;
    /**
     * Set the cursor max
     *
     * @param max - Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find(). The $max specifies the upper bound for all keys of a specific index in order.
     */
    max(max: Document): this;
    /**
     * Set the cursor returnKey.
     * If set to true, modifies the cursor to only return the index field or fields for the results of the query, rather than documents.
     * If set to true and the query does not use an index to perform the read operation, the returned documents will not contain any fields.
     *
     * @param value - the returnKey value.
     */
    returnKey(value: boolean): this;
    /**
     * Modifies the output of a query by adding a field $recordId to matching documents. $recordId is the internal key which uniquely identifies a document in a collection.
     *
     * @param value - The $showDiskLoc option has now been deprecated and replaced with the showRecordId field. $showDiskLoc will still be accepted for OP_QUERY stye find.
     */
    showRecordId(value: boolean): this;
    /**
     * Add a query modifier to the cursor query
     *
     * @param name - The query modifier (must start with $, such as $orderby etc)
     * @param value - The modifier value.
     */
    addQueryModifier(name: string, value: string | boolean | number | Document): this;
    /**
     * Add a comment to the cursor query allowing for tracking the comment in the log.
     *
     * @param value - The comment attached to this query.
     */
    comment(value: string): this;
    /**
     * Set a maxAwaitTimeMS on a tailing cursor query to allow to customize the timeout value for the option awaitData (Only supported on MongoDB 3.2 or higher, ignored otherwise)
     *
     * @param value - Number of milliseconds to wait before aborting the tailed query.
     */
    maxAwaitTimeMS(value: number): this;
    /**
     * Set a maxTimeMS on the cursor query, allowing for hard timeout limits on queries (Only supported on MongoDB 2.6 or higher)
     *
     * @param value - Number of milliseconds to wait before aborting the query.
     */
    maxTimeMS(value: number): this;
    /**
     * Add a project stage to the aggregation pipeline
     *
     * @remarks
     * In order to strictly type this function you must provide an interface
     * that represents the effect of your projection on the result documents.
     *
     * By default chaining a projection to your cursor changes the returned type to the generic
     * {@link Document} type.
     * You should specify a parameterized type to have assertions on your final results.
     *
     * @example
     * ```typescript
     * // Best way
     * const docs: FindCursor<{ a: number }> = cursor.project<{ a: number }>({ _id: 0, a: true });
     * // Flexible way
     * const docs: FindCursor<Document> = cursor.project({ _id: 0, a: true });
     * ```
     *
     * @remarks
     *
     * **Note for Typescript Users:** adding a transform changes the return type of the iteration of this cursor,
     * it **does not** return a new instance of a cursor. This means when calling project,
     * you should always assign the result to a new variable in order to get a correctly typed cursor variable.
     * Take note of the following example:
     *
     * @example
     * ```typescript
     * const cursor: FindCursor<{ a: number; b: string }> = coll.find();
     * const projectCursor = cursor.project<{ a: number }>({ _id: 0, a: true });
     * const aPropOnlyArray: {a: number}[] = await projectCursor.toArray();
     *
     * // or always use chaining and save the final cursor
     *
     * const cursor = coll.find().project<{ a: string }>({
     *   _id: 0,
     *   a: { $convert: { input: '$a', to: 'string' }
     * }});
     * ```
     */
    project<T extends Document = Document>(value: Document): FindCursor<T>;
    /**
     * Sets the sort order of the cursor query.
     *
     * @param sort - The key or keys set for the sort.
     * @param direction - The direction of the sorting (1 or -1).
     */
    sort(sort: Sort | string, direction?: SortDirection): this;
    /**
     * Allows disk use for blocking sort operations exceeding 100MB memory. (MongoDB 3.2 or higher)
     *
     * @remarks
     * {@link https://docs.mongodb.com/manual/reference/command/find/#find-cmd-allowdiskuse | find command allowDiskUse documentation}
     */
    allowDiskUse(allow?: boolean): this;
    /**
     * Set the collation options for the cursor.
     *
     * @param value - The cursor collation options (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields).
     */
    collation(value: CollationOptions): this;
    /**
     * Set the limit for the cursor.
     *
     * @param value - The limit for the cursor query.
     */
    limit(value: number): this;
    /**
     * Set the skip for the cursor.
     *
     * @param value - The skip for the cursor query.
     */
    skip(value: number): this;
}

/** @public */
export declare interface FindOneAndDeleteOptions extends CommandOperationOptions {
    /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
    hint?: Document;
    /** Limits the fields to return for all matching documents. */
    projection?: Document;
    /** Determines which document the operation modifies if the query selects multiple documents. */
    sort?: Sort;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
}

/** @public */
export declare interface FindOneAndReplaceOptions extends CommandOperationOptions {
    /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
    bypassDocumentValidation?: boolean;
    /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
    hint?: Document;
    /** Limits the fields to return for all matching documents. */
    projection?: Document;
    /** When set to 'after', returns the updated document rather than the original. The default is 'before'.  */
    returnDocument?: ReturnDocument;
    /** Determines which document the operation modifies if the query selects multiple documents. */
    sort?: Sort;
    /** Upsert the document if it does not exist. */
    upsert?: boolean;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
}

/** @public */
export declare interface FindOneAndUpdateOptions extends CommandOperationOptions {
    /** Optional list of array filters referenced in filtered positional operators */
    arrayFilters?: Document[];
    /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
    bypassDocumentValidation?: boolean;
    /** An optional hint for query optimization. See the {@link https://docs.mongodb.com/manual/reference/command/update/#update-command-hint|update command} reference for more information.*/
    hint?: Document;
    /** Limits the fields to return for all matching documents. */
    projection?: Document;
    /** When set to 'after', returns the updated document rather than the original. The default is 'before'.  */
    returnDocument?: ReturnDocument;
    /** Determines which document the operation modifies if the query selects multiple documents. */
    sort?: Sort;
    /** Upsert the document if it does not exist. */
    upsert?: boolean;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
}

/**
 * A builder object that is returned from {@link BulkOperationBase#find}.
 * Is used to build a write operation that involves a query filter.
 *
 * @public
 */
export declare class FindOperators {
    bulkOperation: BulkOperationBase;
    /* Excluded from this release type: __constructor */
    /** Add a multiple update operation to the bulk operation */
    update(updateDocument: Document | Document[]): BulkOperationBase;
    /** Add a single update operation to the bulk operation */
    updateOne(updateDocument: Document | Document[]): BulkOperationBase;
    /** Add a replace one operation to the bulk operation */
    replaceOne(replacement: Document): BulkOperationBase;
    /** Add a delete one operation to the bulk operation */
    deleteOne(): BulkOperationBase;
    /** Add a delete many operation to the bulk operation */
    delete(): BulkOperationBase;
    /** Upsert modifier for update bulk operation, noting that this operation is an upsert. */
    upsert(): this;
    /** Specifies the collation for the query condition. */
    collation(collation: CollationOptions): this;
    /** Specifies arrayFilters for UpdateOne or UpdateMany bulk operations. */
    arrayFilters(arrayFilters: Document[]): this;
    /** Specifies hint for the bulk operation. */
    hint(hint: Hint): this;
}

/**
 * @public
 * @typeParam TSchema - Unused schema definition, deprecated usage, only specify `FindOptions` with no generic
 */
export declare interface FindOptions<TSchema extends Document = Document> extends CommandOperationOptions {
    /** Sets the limit of documents returned in the query. */
    limit?: number;
    /** Set to sort the documents coming back from the query. Array of indexes, `[['a', 1]]` etc. */
    sort?: Sort;
    /** The fields to return in the query. Object of fields to either include or exclude (one of, not both), `{'a':1, 'b': 1}` **or** `{'a': 0, 'b': 0}` */
    projection?: Document;
    /** Set to skip N documents ahead in your query (useful for pagination). */
    skip?: number;
    /** Tell the query to use specific indexes in the query. Object of indexes to use, `{'_id':1}` */
    hint?: Hint;
    /** Specify if the cursor can timeout. */
    timeout?: boolean;
    /** Specify if the cursor is tailable. */
    tailable?: boolean;
    /** Specify if the cursor is a tailable-await cursor. Requires `tailable` to be true */
    awaitData?: boolean;
    /** Set the batchSize for the getMoreCommand when iterating over the query results. */
    batchSize?: number;
    /** If true, returns only the index keys in the resulting documents. */
    returnKey?: boolean;
    /** The inclusive lower bound for a specific index */
    min?: Document;
    /** The exclusive upper bound for a specific index */
    max?: Document;
    /** Number of milliseconds to wait before aborting the query. */
    maxTimeMS?: number;
    /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. Requires `tailable` and `awaitData` to be true */
    maxAwaitTimeMS?: number;
    /** The server normally times out idle cursors after an inactivity period (10 minutes) to prevent excess memory use. Set this option to prevent that. */
    noCursorTimeout?: boolean;
    /** Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields). */
    collation?: CollationOptions;
    /** Allows disk use for blocking sort operations exceeding 100MB memory. (MongoDB 3.2 or higher) */
    allowDiskUse?: boolean;
    /** Determines whether to close the cursor after the first batch. Defaults to false. */
    singleBatch?: boolean;
    /** For queries against a sharded collection, allows the command (or subsequent getMore commands) to return partial results, rather than an error, if one or more queried shards are unavailable. */
    allowPartialResults?: boolean;
    /** Determines whether to return the record identifier for each document. If true, adds a field $recordId to the returned documents. */
    showRecordId?: boolean;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
    /**
     * Option to enable an optimized code path for queries looking for a particular range of `ts` values in the oplog. Requires `tailable` to be true.
     * @deprecated Starting from MongoDB 4.4 this flag is not needed and will be ignored.
     */
    oplogReplay?: boolean;
}

/** @public */
export declare type Flatten<Type> = Type extends ReadonlyArray<infer Item> ? Item : Type;

/** @public */
export declare type GenericListener = (...args: any[]) => void;

/* Excluded from this release type: GetMoreOptions */

/**
 * Constructor for a streaming GridFS interface
 * @public
 */
export declare class GridFSBucket extends TypedEventEmitter<GridFSBucketEvents> {
    /* Excluded from this release type: s */
    /**
     * When the first call to openUploadStream is made, the upload stream will
     * check to see if it needs to create the proper indexes on the chunks and
     * files collections. This event is fired either when 1) it determines that
     * no index creation is necessary, 2) when it successfully creates the
     * necessary indexes.
     * @event
     */
    static readonly INDEX: "index";
    constructor(db: Db, options?: GridFSBucketOptions);
    /**
     * Returns a writable stream (GridFSBucketWriteStream) for writing
     * buffers to GridFS. The stream's 'id' property contains the resulting
     * file's id.
     *
     * @param filename - The value of the 'filename' key in the files doc
     * @param options - Optional settings.
     */
    openUploadStream(filename: string, options?: GridFSBucketWriteStreamOptions): GridFSBucketWriteStream;
    /**
     * Returns a writable stream (GridFSBucketWriteStream) for writing
     * buffers to GridFS for a custom file id. The stream's 'id' property contains the resulting
     * file's id.
     */
    openUploadStreamWithId(id: ObjectId, filename: string, options?: GridFSBucketWriteStreamOptions): GridFSBucketWriteStream;
    /** Returns a readable stream (GridFSBucketReadStream) for streaming file data from GridFS. */
    openDownloadStream(id: ObjectId, options?: GridFSBucketReadStreamOptions): GridFSBucketReadStream;
    /**
     * Deletes a file with the given id
     *
     * @param id - The id of the file doc
     */
    delete(id: ObjectId): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    delete(id: ObjectId, callback: Callback<void>): void;
    /** Convenience wrapper around find on the files collection */
    find(filter?: Filter<GridFSFile>, options?: FindOptions): FindCursor<GridFSFile>;
    /**
     * Returns a readable stream (GridFSBucketReadStream) for streaming the
     * file with the given name from GridFS. If there are multiple files with
     * the same name, this will stream the most recent file with the given name
     * (as determined by the `uploadDate` field). You can set the `revision`
     * option to change this behavior.
     */
    openDownloadStreamByName(filename: string, options?: GridFSBucketReadStreamOptionsWithRevision): GridFSBucketReadStream;
    /**
     * Renames the file with the given _id to the given string
     *
     * @param id - the id of the file to rename
     * @param filename - new name for the file
     */
    rename(id: ObjectId, filename: string): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    rename(id: ObjectId, filename: string, callback: Callback<void>): void;
    /** Removes this bucket's files collection, followed by its chunks collection. */
    drop(): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    drop(callback: Callback<void>): void;
    /** Get the Db scoped logger. */
    getLogger(): Logger;
}

/** @public */
export declare type GridFSBucketEvents = {
    index(): void;
};

/** @public */
export declare interface GridFSBucketOptions extends WriteConcernOptions {
    /** The 'files' and 'chunks' collections will be prefixed with the bucket name followed by a dot. */
    bucketName?: string;
    /** Number of bytes stored in each chunk. Defaults to 255KB */
    chunkSizeBytes?: number;
    /** Read preference to be passed to read operations */
    readPreference?: ReadPreference;
}

/* Excluded from this release type: GridFSBucketPrivate */

/**
 * A readable stream that enables you to read buffers from GridFS.
 *
 * Do not instantiate this class directly. Use `openDownloadStream()` instead.
 * @public
 */
export declare class GridFSBucketReadStream extends Readable implements NodeJS.ReadableStream {
    /* Excluded from this release type: s */
    /**
     * An error occurred
     * @event
     */
    static readonly ERROR: "error";
    /**
     * Fires when the stream loaded the file document corresponding to the provided id.
     * @event
     */
    static readonly FILE: "file";
    /**
     * Emitted when a chunk of data is available to be consumed.
     * @event
     */
    static readonly DATA: "data";
    /**
     * Fired when the stream is exhausted (no more data events).
     * @event
     */
    static readonly END: "end";
    /**
     * Fired when the stream is exhausted and the underlying cursor is killed
     * @event
     */
    static readonly CLOSE: "close";
    /* Excluded from this release type: __constructor */
    /* Excluded from this release type: _read */
    /**
     * Sets the 0-based offset in bytes to start streaming from. Throws
     * an error if this stream has entered flowing mode
     * (e.g. if you've already called `on('data')`)
     *
     * @param start - 0-based offset in bytes to start streaming from
     */
    start(start?: number): this;
    /**
     * Sets the 0-based offset in bytes to start streaming from. Throws
     * an error if this stream has entered flowing mode
     * (e.g. if you've already called `on('data')`)
     *
     * @param end - Offset in bytes to stop reading at
     */
    end(end?: number): this;
    /**
     * Marks this stream as aborted (will never push another `data` event)
     * and kills the underlying cursor. Will emit the 'end' event, and then
     * the 'close' event once the cursor is successfully killed.
     *
     * @param callback - called when the cursor is successfully closed or an error occurred.
     */
    abort(callback?: Callback<void>): void;
}

/** @public */
export declare interface GridFSBucketReadStreamOptions {
    sort?: Sort;
    skip?: number;
    /**
     * 0-indexed non-negative byte offset from the beginning of the file
     */
    start?: number;
    /**
     * 0-indexed non-negative byte offset to the end of the file contents
     * to be returned by the stream. `end` is non-inclusive
     */
    end?: number;
}

/** @public */
export declare interface GridFSBucketReadStreamOptionsWithRevision extends GridFSBucketReadStreamOptions {
    /** The revision number relative to the oldest file with the given filename. 0
     * gets you the oldest file, 1 gets you the 2nd oldest, -1 gets you the
     * newest. */
    revision?: number;
}

/* Excluded from this release type: GridFSBucketReadStreamPrivate */

/**
 * A writable stream that enables you to write buffers to GridFS.
 *
 * Do not instantiate this class directly. Use `openUploadStream()` instead.
 * @public
 */
export declare class GridFSBucketWriteStream extends Writable implements NodeJS.WritableStream {
    bucket: GridFSBucket;
    chunks: Collection<GridFSChunk>;
    filename: string;
    files: Collection<GridFSFile>;
    options: GridFSBucketWriteStreamOptions;
    done: boolean;
    id: ObjectId;
    chunkSizeBytes: number;
    bufToStore: Buffer;
    length: number;
    n: number;
    pos: number;
    state: {
        streamEnd: boolean;
        outstandingRequests: number;
        errored: boolean;
        aborted: boolean;
    };
    writeConcern?: WriteConcern;
    /** @event */
    static readonly CLOSE = "close";
    /** @event */
    static readonly ERROR = "error";
    /**
     * `end()` was called and the write stream successfully wrote the file metadata and all the chunks to MongoDB.
     * @event
     */
    static readonly FINISH = "finish";
    /* Excluded from this release type: __constructor */
    /**
     * Write a buffer to the stream.
     *
     * @param chunk - Buffer to write
     * @param encodingOrCallback - Optional encoding for the buffer
     * @param callback - Function to call when the chunk was added to the buffer, or if the entire chunk was persisted to MongoDB if this chunk caused a flush.
     * @returns False if this write required flushing a chunk to MongoDB. True otherwise.
     */
    write(chunk: Buffer | string): boolean;
    write(chunk: Buffer | string, callback: Callback<void>): boolean;
    write(chunk: Buffer | string, encoding: BufferEncoding | undefined): boolean;
    write(chunk: Buffer | string, encoding: BufferEncoding | undefined, callback: Callback<void>): boolean;
    /**
     * Places this write stream into an aborted state (all future writes fail)
     * and deletes all chunks that have already been written.
     *
     * @param callback - called when chunks are successfully removed or error occurred
     */
    abort(): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    abort(callback: Callback<void>): void;
    /**
     * Tells the stream that no more data will be coming in. The stream will
     * persist the remaining data to MongoDB, write the files document, and
     * then emit a 'finish' event.
     *
     * @param chunk - Buffer to write
     * @param encoding - Optional encoding for the buffer
     * @param callback - Function to call when all files and chunks have been persisted to MongoDB
     */
    end(): this;
    end(chunk: Buffer): this;
    end(callback: Callback<GridFSFile | void>): this;
    end(chunk: Buffer, callback: Callback<GridFSFile | void>): this;
    end(chunk: Buffer, encoding: BufferEncoding): this;
    end(chunk: Buffer, encoding: BufferEncoding | undefined, callback: Callback<GridFSFile | void>): this;
}

/** @public */
export declare interface GridFSBucketWriteStreamOptions extends WriteConcernOptions {
    /** Overwrite this bucket's chunkSizeBytes for this file */
    chunkSizeBytes?: number;
    /** Custom file id for the GridFS file. */
    id?: ObjectId;
    /** Object to store in the file document's `metadata` field */
    metadata?: Document;
    /** String to store in the file document's `contentType` field */
    contentType?: string;
    /** Array of strings to store in the file document's `aliases` field */
    aliases?: string[];
}

/** @public */
export declare interface GridFSChunk {
    _id: ObjectId;
    files_id: ObjectId;
    n: number;
    data: Buffer | Uint8Array;
}

/** @public */
export declare interface GridFSFile {
    _id: ObjectId;
    length: number;
    chunkSize: number;
    filename: string;
    contentType?: string;
    aliases?: string[];
    metadata?: Document;
    uploadDate: Date;
}

/** @public */
export declare const GSSAPICanonicalizationValue: Readonly<{
    readonly on: true;
    readonly off: false;
    readonly none: "none";
    readonly forward: "forward";
    readonly forwardAndReverse: "forwardAndReverse";
}>;

/** @public */
export declare type GSSAPICanonicalizationValue = typeof GSSAPICanonicalizationValue[keyof typeof GSSAPICanonicalizationValue];

/** @public */
export declare interface HedgeOptions {
    /** Explicitly enable or disable hedged reads. */
    enabled?: boolean;
}

/** @public */
export declare type Hint = string | Document;

/** @public */
export declare class HostAddress {
    host: string | undefined;
    port: number | undefined;
    socketPath: string | undefined;
    isIPv6: boolean;
    constructor(hostString: string);
    inspect(): string;
    toString(): string;
    static fromString(this: void, s: string): HostAddress;
    static fromHostPort(host: string, port: number): HostAddress;
    static fromSrvRecord({ name, port }: SrvRecord): HostAddress;
}

/** @public */
export declare interface IndexDescription extends Pick<CreateIndexesOptions, 'background' | 'unique' | 'partialFilterExpression' | 'sparse' | 'hidden' | 'expireAfterSeconds' | 'storageEngine' | 'version' | 'weights' | 'default_language' | 'language_override' | 'textIndexVersion' | '2dsphereIndexVersion' | 'bits' | 'min' | 'max' | 'bucketSize' | 'wildcardProjection'> {
    collation?: CollationOptions;
    name?: string;
    key: {
        [key: string]: IndexDirection;
    } | Map<string, IndexDirection>;
}

/** @public */
export declare type IndexDirection = -1 | 1 | '2d' | '2dsphere' | 'text' | 'geoHaystack' | 'hashed' | number;

/** @public */
export declare interface IndexInformationOptions {
    full?: boolean;
    readPreference?: ReadPreference;
    session?: ClientSession;
}

/** @public */
export declare type IndexSpecification = OneOrMore<string | [string, IndexDirection] | {
    [key: string]: IndexDirection;
} | Map<string, IndexDirection>>;

/** Given an object shaped type, return the type of the _id field or default to ObjectId @public */
export declare type InferIdType<TSchema> = TSchema extends {
    _id: infer IdType;
} ? Record<any, never> extends IdType ? never : IdType : TSchema extends {
    _id?: infer IdType;
} ? unknown extends IdType ? ObjectId : IdType : ObjectId;

/** @public */
export declare interface InsertManyResult<TSchema = Document> {
    /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
    acknowledged: boolean;
    /** The number of inserted documents for this operations */
    insertedCount: number;
    /** Map of the index of the inserted document to the id of the inserted document */
    insertedIds: {
        [key: number]: InferIdType<TSchema>;
    };
}

/** @public */
export declare interface InsertOneModel<TSchema extends Document = Document> {
    /** The document to insert. */
    document: OptionalId<TSchema>;
}

/** @public */
export declare interface InsertOneOptions extends CommandOperationOptions {
    /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
    bypassDocumentValidation?: boolean;
    /** Force server to assign _id values instead of driver. */
    forceServerObjectId?: boolean;
}

/** @public */
export declare interface InsertOneResult<TSchema = Document> {
    /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
    acknowledged: boolean;
    /** The identifier that was inserted. If the server generated the identifier, this value will be null as the driver does not have access to that data */
    insertedId: InferIdType<TSchema>;
}

export { Int32 }

/** @public */
export declare type IntegerType = number | Int32 | Long;

/* Excluded from this release type: InternalAbstractCursorOptions */

/** @public */
export declare type IsAny<Type, ResultIfAny, ResultIfNotAny> = true extends false & Type ? ResultIfAny : ResultIfNotAny;

/**
 * Helper types for dot-notation filter attributes
 */
/** @public */
export declare type Join<T extends unknown[], D extends string> = T extends [] ? '' : T extends [string | number] ? `${T[0]}` : T extends [string | number, ...infer R] ? `${T[0]}${D}${Join<R, D>}` : string;

/* Excluded from this release type: kBeforeHandshake */

/* Excluded from this release type: kBuffer */

/* Excluded from this release type: kBuiltOptions */

/* Excluded from this release type: kCancellationToken */

/* Excluded from this release type: kCancellationToken_2 */

/* Excluded from this release type: kCancelled */

/* Excluded from this release type: kCancelled_2 */

/* Excluded from this release type: kCheckedOut */

/* Excluded from this release type: kClient */

/* Excluded from this release type: kClosed */

/* Excluded from this release type: kClosed_2 */

/* Excluded from this release type: kClusterTime */

/* Excluded from this release type: kConnection */

/* Excluded from this release type: kConnectionCounter */

/* Excluded from this release type: kConnections */

/* Excluded from this release type: kCursorStream */

/* Excluded from this release type: kDelayedTimeoutId */

/* Excluded from this release type: kDescription */

/* Excluded from this release type: kDocuments */

/* Excluded from this release type: kErrorLabels */

/** @public */
export declare type KeysOfAType<TSchema, Type> = {
    [key in keyof TSchema]: NonNullable<TSchema[key]> extends Type ? key : never;
}[keyof TSchema];

/** @public */
export declare type KeysOfOtherType<TSchema, Type> = {
    [key in keyof TSchema]: NonNullable<TSchema[key]> extends Type ? never : key;
}[keyof TSchema];

/* Excluded from this release type: kFilter */

/* Excluded from this release type: kGeneration */

/* Excluded from this release type: kGeneration_2 */

/* Excluded from this release type: kHello */

/* Excluded from this release type: kId */

/* Excluded from this release type: kInit */

/* Excluded from this release type: kInitialized */

/* Excluded from this release type: kInternalClient */

/* Excluded from this release type: kKilled */

/* Excluded from this release type: kLastUseTime */

/* Excluded from this release type: kLogger */

/* Excluded from this release type: kMessageStream */

/* Excluded from this release type: kMetrics */

/* Excluded from this release type: kMinPoolSizeTimer */

/* Excluded from this release type: kMode */

/* Excluded from this release type: kMonitor */

/* Excluded from this release type: kMonitorId */

/* Excluded from this release type: kNamespace */

/* Excluded from this release type: kNumReturned */

/* Excluded from this release type: kOptions */

/* Excluded from this release type: kOptions_2 */

/* Excluded from this release type: kOptions_3 */

/* Excluded from this release type: kPending */

/* Excluded from this release type: kPinnedConnection */

/* Excluded from this release type: kPipeline */

/* Excluded from this release type: kPoolState */

/* Excluded from this release type: kProcessingWaitQueue */

/* Excluded from this release type: kQueue */

/* Excluded from this release type: kRoundTripTime */

/* Excluded from this release type: kRTTPinger */

/* Excluded from this release type: kServer */

/* Excluded from this release type: kServer_2 */

/* Excluded from this release type: kServer_3 */

/* Excluded from this release type: kServerError */

/* Excluded from this release type: kServerSession */

/* Excluded from this release type: kServiceGenerations */

/* Excluded from this release type: kSession */

/* Excluded from this release type: kSession_2 */

/* Excluded from this release type: kSnapshotEnabled */

/* Excluded from this release type: kSnapshotTime */

/* Excluded from this release type: kStream */

/* Excluded from this release type: kTransform */

/* Excluded from this release type: kTxnNumberIncrement */

/* Excluded from this release type: kWaitQueue */

/* Excluded from this release type: kWaitQueue_2 */

/** @public */
export declare const LEGAL_TCP_SOCKET_OPTIONS: readonly ["family", "hints", "localAddress", "localPort", "lookup"];

/** @public */
export declare const LEGAL_TLS_SOCKET_OPTIONS: readonly ["ALPNProtocols", "ca", "cert", "checkServerIdentity", "ciphers", "crl", "ecdhCurve", "key", "minDHSize", "passphrase", "pfx", "rejectUnauthorized", "secureContext", "secureProtocol", "servername", "session"];

/* Excluded from this release type: List */

/** @public */
export declare class ListCollectionsCursor<T extends Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo = Pick<CollectionInfo, 'name' | 'type'> | CollectionInfo> extends AbstractCursor<T> {
    parent: Db;
    filter: Document;
    options?: ListCollectionsOptions;
    constructor(db: Db, filter: Document, options?: ListCollectionsOptions);
    clone(): ListCollectionsCursor<T>;
    /* Excluded from this release type: _initialize */
}

/** @public */
export declare interface ListCollectionsOptions extends CommandOperationOptions {
    /** Since 4.0: If true, will only return the collection name in the response, and will omit additional info */
    nameOnly?: boolean;
    /** Since 4.0: If true and nameOnly is true, allows a user without the required privilege (i.e. listCollections action on the database) to run the command when access control is enforced. */
    authorizedCollections?: boolean;
    /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
    batchSize?: number;
}

/** @public */
export declare interface ListDatabasesOptions extends CommandOperationOptions {
    /** A query predicate that determines which databases are listed */
    filter?: Document;
    /** A flag to indicate whether the command should return just the database names, or return both database names and size information */
    nameOnly?: boolean;
    /** A flag that determines which databases are returned based on the user privileges when access control is enabled */
    authorizedDatabases?: boolean;
}

/** @public */
export declare interface ListDatabasesResult {
    databases: ({
        name: string;
        sizeOnDisk?: number;
        empty?: boolean;
    } & Document)[];
    totalSize?: number;
    totalSizeMb?: number;
    ok: 1 | 0;
}

/** @public */
export declare class ListIndexesCursor extends AbstractCursor {
    parent: Collection;
    options?: ListIndexesOptions;
    constructor(collection: Collection, options?: ListIndexesOptions);
    clone(): ListIndexesCursor;
    /* Excluded from this release type: _initialize */
}

/** @public */
export declare interface ListIndexesOptions extends CommandOperationOptions {
    /** The batchSize for the returned command cursor or if pre 2.8 the systems batch collection */
    batchSize?: number;
}

/**
 * @public
 * @deprecated This logger is unused and will be removed in the next major version.
 */
export declare class Logger {
    className: string;
    /**
     * Creates a new Logger instance
     *
     * @param className - The Class name associated with the logging instance
     * @param options - Optional logging settings
     */
    constructor(className: string, options?: LoggerOptions);
    /**
     * Log a message at the debug level
     *
     * @param message - The message to log
     * @param object - Additional meta data to log
     */
    debug(message: string, object?: unknown): void;
    /**
     * Log a message at the warn level
     *
     * @param message - The message to log
     * @param object - Additional meta data to log
     */
    warn(message: string, object?: unknown): void;
    /**
     * Log a message at the info level
     *
     * @param message - The message to log
     * @param object - Additional meta data to log
     */
    info(message: string, object?: unknown): void;
    /**
     * Log a message at the error level
     *
     * @param message - The message to log
     * @param object - Additional meta data to log
     */
    error(message: string, object?: unknown): void;
    /** Is the logger set at info level */
    isInfo(): boolean;
    /** Is the logger set at error level */
    isError(): boolean;
    /** Is the logger set at error level */
    isWarn(): boolean;
    /** Is the logger set at debug level */
    isDebug(): boolean;
    /** Resets the logger to default settings, error and no filtered classes */
    static reset(): void;
    /** Get the current logger function */
    static currentLogger(): LoggerFunction;
    /**
     * Set the current logger function
     *
     * @param logger - Custom logging function
     */
    static setCurrentLogger(logger: LoggerFunction): void;
    /**
     * Filter log messages for a particular class
     *
     * @param type - The type of filter (currently only class)
     * @param values - The filters to apply
     */
    static filter(type: string, values: string[]): void;
    /**
     * Set the current log level
     *
     * @param newLevel - Set current log level (debug, warn, info, error)
     */
    static setLevel(newLevel: LoggerLevel): void;
}

/** @public */
export declare type LoggerFunction = (message?: any, ...optionalParams: any[]) => void;

/** @public */
export declare const LoggerLevel: Readonly<{
    readonly ERROR: "error";
    readonly WARN: "warn";
    readonly INFO: "info";
    readonly DEBUG: "debug";
    readonly error: "error";
    readonly warn: "warn";
    readonly info: "info";
    readonly debug: "debug";
}>;

/** @public */
export declare type LoggerLevel = typeof LoggerLevel[keyof typeof LoggerLevel];

/** @public */
export declare interface LoggerOptions {
    logger?: LoggerFunction;
    loggerLevel?: LoggerLevel;
}

export { Long }

/** @public */
export declare type MapFunction<TSchema = Document> = (this: TSchema) => void;

/** @public */
export declare interface MapReduceOptions<TKey = ObjectId, TValue = Document> extends CommandOperationOptions {
    /** Sets the output target for the map reduce job. */
    out?: 'inline' | {
        inline: 1;
    } | {
        replace: string;
    } | {
        merge: string;
    } | {
        reduce: string;
    };
    /** Query filter object. */
    query?: Document;
    /** Sorts the input objects using this key. Useful for optimization, like sorting by the emit key for fewer reduces. */
    sort?: Sort;
    /** Number of objects to return from collection. */
    limit?: number;
    /** Keep temporary data. */
    keeptemp?: boolean;
    /** Finalize function. */
    finalize?: FinalizeFunction<TKey, TValue> | string;
    /** Can pass in variables that can be access from map/reduce/finalize. */
    scope?: Document;
    /** It is possible to make the execution stay in JS. Provided in MongoDB \> 2.0.X. */
    jsMode?: boolean;
    /** Provide statistics on job execution time. */
    verbose?: boolean;
    /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
    bypassDocumentValidation?: boolean;
}

/** @public */
export declare type MatchKeysAndValues<TSchema> = Readonly<{
    [Property in Join<NestedPaths<TSchema, []>, '.'>]?: PropertyType<TSchema, Property>;
} & {
    [Property in `${NestedPathsOfType<TSchema, any[]>}.$${`[${string}]` | ''}`]?: ArrayElement<PropertyType<TSchema, Property extends `${infer Key}.$${string}` ? Key : never>>;
} & {
    [Property in `${NestedPathsOfType<TSchema, Record<string, any>[]>}.$${`[${string}]` | ''}.${string}`]?: any;
} & Document>;

export { MaxKey }

/* Excluded from this release type: MessageHeader */

/* Excluded from this release type: MessageStream */

/* Excluded from this release type: MessageStreamOptions */
export { MinKey }

/**
 * @public
 * @deprecated This type will be completely removed in 5.0 and findOneAndUpdate,
 *             findOneAndDelete, and findOneAndReplace will then return the
 *             actual result document.
 */
export declare interface ModifyResult<TSchema = Document> {
    value: WithId<TSchema> | null;
    lastErrorObject?: Document;
    ok: 0 | 1;
}

/** @public */
export declare const MONGO_CLIENT_EVENTS: readonly ["connectionPoolCreated", "connectionPoolReady", "connectionPoolCleared", "connectionPoolClosed", "connectionCreated", "connectionReady", "connectionClosed", "connectionCheckOutStarted", "connectionCheckOutFailed", "connectionCheckedOut", "connectionCheckedIn", "commandStarted", "commandSucceeded", "commandFailed", "serverOpening", "serverClosed", "serverDescriptionChanged", "topologyOpening", "topologyClosed", "topologyDescriptionChanged", "error", "timeout", "close", "serverHeartbeatStarted", "serverHeartbeatSucceeded", "serverHeartbeatFailed"];

/**
 * An error generated when the driver API is used incorrectly
 *
 * @privateRemarks
 * Should **never** be directly instantiated
 *
 * @public
 * @category Error
 */
export declare class MongoAPIError extends MongoDriverError {
    constructor(message: string);
    get name(): string;
}

/**
 * A error generated when the user attempts to authenticate
 * via AWS, but fails
 *
 * @public
 * @category Error
 */
export declare class MongoAWSError extends MongoRuntimeError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error generated when a batch command is re-executed after one of the commands in the batch
 * has failed
 *
 * @public
 * @category Error
 */
export declare class MongoBatchReExecutionError extends MongoAPIError {
    constructor(message?: string);
    get name(): string;
}

/**
 * An error indicating an unsuccessful Bulk Write
 * @public
 * @category Error
 */
export declare class MongoBulkWriteError extends MongoServerError {
    result: BulkWriteResult;
    writeErrors: OneOrMore<WriteError>;
    err?: WriteConcernError;
    /** Creates a new MongoBulkWriteError */
    constructor(error: {
        message: string;
        code: number;
        writeErrors?: WriteError[];
    } | WriteConcernError | AnyError, result: BulkWriteResult);
    get name(): string;
    /** Number of documents inserted. */
    get insertedCount(): number;
    /** Number of documents matched for update. */
    get matchedCount(): number;
    /** Number of documents modified. */
    get modifiedCount(): number;
    /** Number of documents deleted. */
    get deletedCount(): number;
    /** Number of documents upserted. */
    get upsertedCount(): number;
    /** Inserted document generated Id's, hash key is the index of the originating operation */
    get insertedIds(): {
        [key: number]: any;
    };
    /** Upserted document generated Id's, hash key is the index of the originating operation */
    get upsertedIds(): {
        [key: number]: any;
    };
}

/**
 * An error generated when a ChangeStream operation fails to execute.
 *
 * @public
 * @category Error
 */
export declare class MongoChangeStreamError extends MongoRuntimeError {
    constructor(message: string);
    get name(): string;
}

/**
 * The **MongoClient** class is a class that allows for making Connections to MongoDB.
 * @public
 *
 * @remarks
 * The programmatically provided options take precedence over the URI options.
 *
 * @example
 * ```ts
 * import { MongoClient } from 'mongodb';
 *
 * // Enable command monitoring for debugging
 * const client = new MongoClient('mongodb://localhost:27017', { monitorCommands: true });
 *
 * client.on('commandStarted', started => console.log(started));
 * client.db().collection('pets');
 * await client.insertOne({ name: 'spot', kind: 'dog' });
 * ```
 */
export declare class MongoClient extends TypedEventEmitter<MongoClientEvents> {
    /* Excluded from this release type: s */
    /* Excluded from this release type: topology */
    /* Excluded from this release type: mongoLogger */
    /* Excluded from this release type: [kOptions] */
    constructor(url: string, options?: MongoClientOptions);
    get options(): Readonly<MongoOptions>;
    get serverApi(): Readonly<ServerApi | undefined>;
    /* Excluded from this release type: monitorCommands */
    /* Excluded from this release type: monitorCommands */
    get autoEncrypter(): AutoEncrypter | undefined;
    get readConcern(): ReadConcern | undefined;
    get writeConcern(): WriteConcern | undefined;
    get readPreference(): ReadPreference;
    get bsonOptions(): BSONSerializeOptions;
    get logger(): Logger;
    /**
     * Connect to MongoDB using a url
     *
     * @see docs.mongodb.org/manual/reference/connection-string/
     */
    connect(): Promise<this>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    connect(callback: Callback<this>): void;
    /**
     * Close the db and its underlying connections
     *
     * @param force - Force close, emitting no events
     * @param callback - An optional callback, a Promise will be returned if none is provided
     */
    close(): Promise<void>;
    close(force: boolean): Promise<void>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    close(callback: Callback<void>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    close(force: boolean, callback: Callback<void>): void;
    /**
     * Create a new Db instance sharing the current socket connections.
     *
     * @param dbName - The name of the database we want to use. If not provided, use database name from connection string.
     * @param options - Optional settings for Db construction
     */
    db(dbName?: string, options?: DbOptions): Db;
    /**
     * Connect to MongoDB using a url
     *
     * @remarks
     * The programmatically provided options take precedence over the URI options.
     *
     * @see https://docs.mongodb.org/manual/reference/connection-string/
     */
    static connect(url: string): Promise<MongoClient>;
    static connect(url: string, options: MongoClientOptions): Promise<MongoClient>;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    static connect(url: string, callback: Callback<MongoClient>): void;
    /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
    static connect(url: string, options: MongoClientOptions, callback: Callback<MongoClient>): void;
    /** Starts a new session on the server */
    startSession(): ClientSession;
    startSession(options: ClientSessionOptions): ClientSession;
    /**
     * Runs a given operation with an implicitly created session. The lifetime of the session
     * will be handled without the need for user interaction.
     *
     * NOTE: presently the operation MUST return a Promise (either explicit or implicitly as an async function)
     *
     * @param options - Optional settings for the command
     * @param callback - An callback to execute with an implicitly created session
     */
    withSession(callback: WithSessionCallback): Promise<void>;
    withSession(options: ClientSessionOptions, callback: WithSessionCallback): Promise<void>;
    /**
     * Create a new Change Stream, watching for new changes (insertions, updates,
     * replacements, deletions, and invalidations) in this cluster. Will ignore all
     * changes to system collections, as well as the local, admin, and config databases.
     *
     * @remarks
     * watch() accepts two generic arguments for distinct use cases:
     * - The first is to provide the schema that may be defined for all the data within the current cluster
     * - The second is to override the shape of the change stream document entirely, if it is not provided the type will default to ChangeStreamDocument of the first argument
     *
     * @param pipeline - An array of {@link https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/|aggregation pipeline stages} through which to pass change stream documents. This allows for filtering (using $match) and manipulating the change stream documents.
     * @param options - Optional settings for the command
     * @typeParam TSchema - Type of the data being detected by the change stream
     * @typeParam TChange - Type of the whole change stream document emitted
     */
    watch<TSchema extends Document = Document, TChange extends Document = ChangeStreamDocument<TSchema>>(pipeline?: Document[], options?: ChangeStreamOptions): ChangeStream<TSchema, TChange>;
    /** Return the mongo client logger */
    getLogger(): Logger;
}

/** @public */
export declare type MongoClientEvents = Pick<TopologyEvents, typeof MONGO_CLIENT_EVENTS[number]> & {
    open(mongoClient: MongoClient): void;
};

/**
 * Describes all possible URI query options for the mongo client
 * @public
 * @see https://docs.mongodb.com/manual/reference/connection-string
 */
export declare interface MongoClientOptions extends BSONSerializeOptions, SupportedNodeConnectionOptions {
    /** Specifies the name of the replica set, if the mongod is a member of a replica set. */
    replicaSet?: string;
    /** Enables or disables TLS/SSL for the connection. */
    tls?: boolean;
    /** A boolean to enable or disables TLS/SSL for the connection. (The ssl option is equivalent to the tls option.) */
    ssl?: boolean;
    /** Specifies the location of a local TLS Certificate */
    tlsCertificateFile?: string;
    /** Specifies the location of a local .pem file that contains either the client's TLS/SSL certificate and key or only the client's TLS/SSL key when tlsCertificateFile is used to provide the certificate. */
    tlsCertificateKeyFile?: string;
    /** Specifies the password to de-crypt the tlsCertificateKeyFile. */
    tlsCertificateKeyFilePassword?: string;
    /** Specifies the location of a local .pem file that contains the root certificate chain from the Certificate Authority. This file is used to validate the certificate presented by the mongod/mongos instance. */
    tlsCAFile?: string;
    /** Bypasses validation of the certificates presented by the mongod/mongos instance */
    tlsAllowInvalidCertificates?: boolean;
    /** Disables hostname validation of the certificate presented by the mongod/mongos instance. */
    tlsAllowInvalidHostnames?: boolean;
    /** Disables various certificate validations. */
    tlsInsecure?: boolean;
    /** The time in milliseconds to attempt a connection before timing out. */
    connectTimeoutMS?: number;
    /** The time in milliseconds to attempt a send or receive on a socket before the attempt times out. */
    socketTimeoutMS?: number;
    /** An array or comma-delimited string of compressors to enable network compression for communication between this client and a mongod/mongos instance. */
    compressors?: CompressorName[] | string;
    /** An integer that specifies the compression level if using zlib for network compression. */
    zlibCompressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
    /** The maximum number of hosts to connect to when using an srv connection string, a setting of `0` means unlimited hosts */
    srvMaxHosts?: number;
    /**
     * Modifies the srv URI to look like:
     *
     * `_{srvServiceName}._tcp.{hostname}.{domainname}`
     *
     * Querying this DNS URI is expected to respond with SRV records
     */
    srvServiceName?: string;
    /** The maximum number of connections in the connection pool. */
    maxPoolSize?: number;
    /** The minimum number of connections in the connection pool. */
    minPoolSize?: number;
    /** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
    maxConnecting?: number;
    /** The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. */
    maxIdleTimeMS?: number;
    /** The maximum time in milliseconds that a thread can wait for a connection to become available. */
    waitQueueTimeoutMS?: number;
    /** Specify a read concern for the collection (only MongoDB 3.2 or higher supported) */
    readConcern?: ReadConcernLike;
    /** The level of isolation */
    readConcernLevel?: ReadConcernLevel;
    /** Specifies the read preferences for this connection */
    readPreference?: ReadPreferenceMode | ReadPreference;
    /** Specifies, in seconds, how stale a secondary can be before the client stops using it for read operations. */
    maxStalenessSeconds?: number;
    /** Specifies the tags document as a comma-separated list of colon-separated key-value pairs.  */
    readPreferenceTags?: TagSet[];
    /** The auth settings for when connection to server. */
    auth?: Auth;
    /** Specify the database name associated with the user’s credentials. */
    authSource?: string;
    /** Specify the authentication mechanism that MongoDB will use to authenticate the connection. */
    authMechanism?: AuthMechanism;
    /** Specify properties for the specified authMechanism as a comma-separated list of colon-separated key-value pairs. */
    authMechanismProperties?: AuthMechanismProperties;
    /** The size (in milliseconds) of the latency window for selecting among multiple suitable MongoDB instances. */
    localThresholdMS?: number;
    /** Specifies how long (in milliseconds) to block for server selection before throwing an exception.  */
    serverSelectionTimeoutMS?: number;
    /** heartbeatFrequencyMS controls when the driver checks the state of the MongoDB deployment. Specify the interval (in milliseconds) between checks, counted from the end of the previous check until the beginning of the next one. */
    heartbeatFrequencyMS?: number;
    /** Sets the minimum heartbeat frequency. In the event that the driver has to frequently re-check a server's availability, it will wait at least this long since the previous check to avoid wasted effort. */
    minHeartbeatFrequencyMS?: number;
    /** The name of the application that created this MongoClient instance. MongoDB 3.4 and newer will print this value in the server log upon establishing each connection. It is also recorded in the slow query log and profile collections */
    appName?: string;
    /** Enables retryable reads. */
    retryReads?: boolean;
    /** Enable retryable writes. */
    retryWrites?: boolean;
    /** Allow a driver to force a Single topology type with a connection string containing one host */
    directConnection?: boolean;
    /** Instruct the driver it is connecting to a load balancer fronting a mongos like service */
    loadBalanced?: boolean;
    /**
     * The write concern w value
     * @deprecated Please use the `writeConcern` option instead
     */
    w?: W;
    /**
     * The write concern timeout
     * @deprecated Please use the `writeConcern` option instead
     */
    wtimeoutMS?: number;
    /**
     * The journal write concern
     * @deprecated Please use the `writeConcern` option instead
     */
    journal?: boolean;
    /**
     * A MongoDB WriteConcern, which describes the level of acknowledgement
     * requested from MongoDB for write operations.
     *
     * @see https://docs.mongodb.com/manual/reference/write-concern/
     */
    writeConcern?: WriteConcern | WriteConcernSettings;
    /** Validate mongod server certificate against Certificate Authority */
    sslValidate?: boolean;
    /** SSL Certificate file path. */
    sslCA?: string;
    /** SSL Certificate file path. */
    sslCert?: string;
    /** SSL Key file file path. */
    sslKey?: string;
    /** SSL Certificate pass phrase. */
    sslPass?: string;
    /** SSL Certificate revocation list file path. */
    sslCRL?: string;
    /** TCP Connection no delay */
    noDelay?: boolean;
    /** TCP Connection keep alive enabled */
    keepAlive?: boolean;
    /** The number of milliseconds to wait before initiating keepAlive on the TCP socket */
    keepAliveInitialDelay?: number;
    /** Force server to assign `_id` values instead of driver */
    forceServerObjectId?: boolean;
    /** A primary key factory function for generation of custom `_id` keys */
    pkFactory?: PkFactory;
    /**
     * A Promise library class the application wishes to use such as Bluebird, must be ES6 compatible
     * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
     */
    promiseLibrary?: any;
    /** The logging level */
    loggerLevel?: LoggerLevel;
    /** Custom logger object */
    logger?: Logger;
    /** Enable command monitoring for this client */
    monitorCommands?: boolean;
    /** Server API version */
    serverApi?: ServerApi | ServerApiVersion;
    /**
     * Optionally enable in-use auto encryption
     *
     * @remarks
     *  Automatic encryption is an enterprise only feature that only applies to operations on a collection. Automatic encryption is not supported for operations on a database or view, and operations that are not bypassed will result in error
     *  (see [libmongocrypt: Auto Encryption Allow-List](https://github.com/mongodb/specifications/blob/master/source/client-side-encryption/client-side-encryption.rst#libmongocrypt-auto-encryption-allow-list)). To bypass automatic encryption for all operations, set bypassAutoEncryption=true in AutoEncryptionOpts.
     *
     *  Automatic encryption requires the authenticated user to have the [listCollections privilege action](https://docs.mongodb.com/manual/reference/command/listCollections/#dbcmd.listCollections).
     *
     *  If a MongoClient with a limited connection pool size (i.e a non-zero maxPoolSize) is configured with AutoEncryptionOptions, a separate internal MongoClient is created if any of the following are true:
     *  - AutoEncryptionOptions.keyVaultClient is not passed.
     *  - AutoEncryptionOptions.bypassAutomaticEncryption is false.
     *
     * If an internal MongoClient is created, it is configured with the same options as the parent MongoClient except minPoolSize is set to 0 and AutoEncryptionOptions is omitted.
     */
    autoEncryption?: AutoEncryptionOptions;
    /** Allows a wrapping driver to amend the client metadata generated by the driver to include information about the wrapping driver */
    driverInfo?: DriverInfo;
    /** Configures a Socks5 proxy host used for creating TCP connections. */
    proxyHost?: string;
    /** Configures a Socks5 proxy port used for creating TCP connections. */
    proxyPort?: number;
    /** Configures a Socks5 proxy username when the proxy in proxyHost requires username/password authentication. */
    proxyUsername?: string;
    /** Configures a Socks5 proxy password when the proxy in proxyHost requires username/password authentication. */
    proxyPassword?: string;
    /* Excluded from this release type: srvPoller */
    /* Excluded from this release type: connectionType */
    /* Excluded from this release type: __index */
}

/* Excluded from this release type: MongoClientPrivate */

/**
 * An error generated when a feature that is not enabled or allowed for the current server
 * configuration is used
 *
 *
 * @public
 * @category Error
 */
export declare class MongoCompatibilityError extends MongoAPIError {
    constructor(message: string);
    get name(): string;
}

/**
 * A representation of the credentials used by MongoDB
 * @public
 */
export declare class MongoCredentials {
    /** The username used for authentication */
    readonly username: string;
    /** The password used for authentication */
    readonly password: string;
    /** The database that the user should authenticate against */
    readonly source: string;
    /** The method used to authenticate */
    readonly mechanism: AuthMechanism;
    /** Special properties used by some types of auth mechanisms */
    readonly mechanismProperties: AuthMechanismProperties;
    constructor(options: MongoCredentialsOptions);
    /** Determines if two MongoCredentials objects are equivalent */
    equals(other: MongoCredentials): boolean;
    /**
     * If the authentication mechanism is set to "default", resolves the authMechanism
     * based on the server version and server supported sasl mechanisms.
     *
     * @param hello - A hello response from the server
     */
    resolveAuthMechanism(hello?: Document): MongoCredentials;
    validate(): void;
    static merge(creds: MongoCredentials | undefined, options: Partial<MongoCredentialsOptions>): MongoCredentials;
}

/** @public */
export declare interface MongoCredentialsOptions {
    username: string;
    password: string;
    source: string;
    db?: string;
    mechanism?: AuthMechanism;
    mechanismProperties: AuthMechanismProperties;
}

/**
 * An error thrown when an attempt is made to read from a cursor that has been exhausted
 *
 * @public
 * @category Error
 */
export declare class MongoCursorExhaustedError extends MongoAPIError {
    constructor(message?: string);
    get name(): string;
}

/**
 * An error thrown when the user attempts to add options to a cursor that has already been
 * initialized
 *
 * @public
 * @category Error
 */
export declare class MongoCursorInUseError extends MongoAPIError {
    constructor(message?: string);
    get name(): string;
}

/** @public */
export declare class MongoDBNamespace {
    db: string;
    collection: string | undefined;
    /**
     * Create a namespace object
     *
     * @param db - database name
     * @param collection - collection name
     */
    constructor(db: string, collection?: string);
    toString(): string;
    withCollection(collection: string): MongoDBNamespace;
    static fromString(namespace?: string): MongoDBNamespace;
}

/**
 * An error generated when the driver fails to decompress
 * data received from the server.
 *
 * @public
 * @category Error
 */
export declare class MongoDecompressionError extends MongoRuntimeError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error generated by the driver
 *
 * @public
 * @category Error
 */
export declare class MongoDriverError extends MongoError {
    constructor(message: string);
    get name(): string;
}

/**
 * @public
 * @category Error
 *
 * @privateRemarks
 * mongodb-client-encryption has a dependency on this error, it uses the constructor with a string argument
 */
export declare class MongoError extends Error {
    /* Excluded from this release type: [kErrorLabels] */
    /**
     * This is a number in MongoServerError and a string in MongoDriverError
     * @privateRemarks
     * Define the type override on the subclasses when we can use the override keyword
     */
    code?: number | string;
    topologyVersion?: TopologyVersion;
    connectionGeneration?: number;
    cause?: Error;
    constructor(message: string | Error);
    get name(): string;
    /** Legacy name for server error responses */
    get errmsg(): string;
    /**
     * Checks the error to see if it has an error label
     *
     * @param label - The error label to check for
     * @returns returns true if the error has the provided error label
     */
    hasErrorLabel(label: string): boolean;
    addErrorLabel(label: string): void;
    get errorLabels(): string[];
}

/** @public */
export declare const MongoErrorLabel: Readonly<{
    readonly RetryableWriteError: "RetryableWriteError";
    readonly TransientTransactionError: "TransientTransactionError";
    readonly UnknownTransactionCommitResult: "UnknownTransactionCommitResult";
    readonly ResumableChangeStreamError: "ResumableChangeStreamError";
    readonly HandshakeError: "HandshakeError";
    readonly ResetPool: "ResetPool";
    readonly InterruptInUseConnections: "InterruptInUseConnections";
    readonly NoWritesPerformed: "NoWritesPerformed";
}>;

/** @public */
export declare type MongoErrorLabel = typeof MongoErrorLabel[keyof typeof MongoErrorLabel];

/**
 * An error generated when the user attempts to operate
 * on a session that has expired or has been closed.
 *
 * @public
 * @category Error
 */
export declare class MongoExpiredSessionError extends MongoAPIError {
    constructor(message?: string);
    get name(): string;
}

/**
 * An error generated when a malformed or invalid chunk is
 * encountered when reading from a GridFSStream.
 *
 * @public
 * @category Error
 */
export declare class MongoGridFSChunkError extends MongoRuntimeError {
    constructor(message: string);
    get name(): string;
}

/** An error generated when a GridFSStream operation fails to execute.
 *
 * @public
 * @category Error
 */
export declare class MongoGridFSStreamError extends MongoRuntimeError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error generated when the user supplies malformed or unexpected arguments
 * or when a required argument or field is not provided.
 *
 *
 * @public
 * @category Error
 */
export declare class MongoInvalidArgumentError extends MongoAPIError {
    constructor(message: string);
    get name(): string;
}

/**
 * A error generated when the user attempts to authenticate
 * via Kerberos, but fails to connect to the Kerberos client.
 *
 * @public
 * @category Error
 */
export declare class MongoKerberosError extends MongoRuntimeError {
    constructor(message: string);
    get name(): string;
}

/* Excluded from this release type: MongoLoggableComponent */

/* Excluded from this release type: MongoLogger */

/* Excluded from this release type: MongoLoggerEnvOptions */

/* Excluded from this release type: MongoLoggerMongoClientOptions */

/* Excluded from this release type: MongoLoggerOptions */

/**
 * An error generated when the user fails to provide authentication credentials before attempting
 * to connect to a mongo server instance.
 *
 *
 * @public
 * @category Error
 */
export declare class MongoMissingCredentialsError extends MongoAPIError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error generated when a required module or dependency is not present in the local environment
 *
 * @public
 * @category Error
 */
export declare class MongoMissingDependencyError extends MongoAPIError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error indicating an issue with the network, including TCP errors and timeouts.
 * @public
 * @category Error
 */
export declare class MongoNetworkError extends MongoError {
    /* Excluded from this release type: [kBeforeHandshake] */
    constructor(message: string | Error, options?: MongoNetworkErrorOptions);
    get name(): string;
}

/** @public */
export declare interface MongoNetworkErrorOptions {
    /** Indicates the timeout happened before a connection handshake completed */
    beforeHandshake: boolean;
}

/**
 * An error indicating a network timeout occurred
 * @public
 * @category Error
 *
 * @privateRemarks
 * mongodb-client-encryption has a dependency on this error with an instanceof check
 */
export declare class MongoNetworkTimeoutError extends MongoNetworkError {
    constructor(message: string, options?: MongoNetworkErrorOptions);
    get name(): string;
}

/**
 * An error thrown when the user attempts to operate on a database or collection through a MongoClient
 * that has not yet successfully called the "connect" method
 *
 * @public
 * @category Error
 */
export declare class MongoNotConnectedError extends MongoAPIError {
    constructor(message: string);
    get name(): string;
}

/**
 * Mongo Client Options
 * @public
 */
export declare interface MongoOptions extends Required<Pick<MongoClientOptions, 'autoEncryption' | 'connectTimeoutMS' | 'directConnection' | 'driverInfo' | 'forceServerObjectId' | 'minHeartbeatFrequencyMS' | 'heartbeatFrequencyMS' | 'keepAlive' | 'keepAliveInitialDelay' | 'localThresholdMS' | 'logger' | 'maxConnecting' | 'maxIdleTimeMS' | 'maxPoolSize' | 'minPoolSize' | 'monitorCommands' | 'noDelay' | 'pkFactory' | 'promiseLibrary' | 'raw' | 'replicaSet' | 'retryReads' | 'retryWrites' | 'serverSelectionTimeoutMS' | 'socketTimeoutMS' | 'srvMaxHosts' | 'srvServiceName' | 'tlsAllowInvalidCertificates' | 'tlsAllowInvalidHostnames' | 'tlsInsecure' | 'waitQueueTimeoutMS' | 'zlibCompressionLevel'>>, SupportedNodeConnectionOptions {
    hosts: HostAddress[];
    srvHost?: string;
    credentials?: MongoCredentials;
    readPreference: ReadPreference;
    readConcern: ReadConcern;
    loadBalanced: boolean;
    serverApi: ServerApi;
    compressors: CompressorName[];
    writeConcern: WriteConcern;
    dbName: string;
    metadata: ClientMetadata;
    autoEncrypter?: AutoEncrypter;
    proxyHost?: string;
    proxyPort?: number;
    proxyUsername?: string;
    proxyPassword?: string;
    /* Excluded from this release type: connectionType */
    /* Excluded from this release type: encrypter */
    /* Excluded from this release type: userSpecifiedAuthSource */
    /* Excluded from this release type: userSpecifiedReplicaSet */
    /**
     * # NOTE ABOUT TLS Options
     *
     * If set TLS enabled, equivalent to setting the ssl option.
     *
     * ### Additional options:
     *
     * |    nodejs option     | MongoDB equivalent                                       | type                                   |
     * |:---------------------|--------------------------------------------------------- |:---------------------------------------|
     * | `ca`                 | `sslCA`, `tlsCAFile`                                     | `string \| Buffer \| Buffer[]`         |
     * | `crl`                | `sslCRL`                                                 | `string \| Buffer \| Buffer[]`         |
     * | `cert`               | `sslCert`, `tlsCertificateFile`, `tlsCertificateKeyFile` | `string \| Buffer \| Buffer[]`         |
     * | `key`                | `sslKey`, `tlsCertificateKeyFile`                        | `string \| Buffer \| KeyObject[]`      |
     * | `passphrase`         | `sslPass`, `tlsCertificateKeyFilePassword`               | `string`                               |
     * | `rejectUnauthorized` | `sslValidate`                                            | `boolean`                              |
     *
     */
    tls: boolean;
    /* Excluded from this release type: __index */
    /* Excluded from this release type: mongoLoggerOptions */
}

/**
 * An error used when attempting to parse a value (like a connection string)
 * @public
 * @category Error
 */
export declare class MongoParseError extends MongoDriverError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error generated when the driver encounters unexpected input
 * or reaches an unexpected/invalid internal state
 *
 * @privateRemarks
 * Should **never** be directly instantiated.
 *
 * @public
 * @category Error
 */
export declare class MongoRuntimeError extends MongoDriverError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error generated when an attempt is made to operate
 * on a closed/closing server.
 *
 * @public
 * @category Error
 */
export declare class MongoServerClosedError extends MongoAPIError {
    constructor(message?: string);
    get name(): string;
}

/**
 * An error coming from the mongo server
 *
 * @public
 * @category Error
 */
export declare class MongoServerError extends MongoError {
    codeName?: string;
    writeConcernError?: Document;
    errInfo?: Document;
    ok?: number;
    [key: string]: any;
    constructor(message: ErrorDescription);
    get name(): string;
}

/**
 * An error signifying a client-side server selection error
 * @public
 * @category Error
 */
export declare class MongoServerSelectionError extends MongoSystemError {
    constructor(message: string, reason: TopologyDescription);
    get name(): string;
}

/**
 * An error signifying a general system issue
 * @public
 * @category Error
 */
export declare class MongoSystemError extends MongoError {
    /** An optional reason context, such as an error saved during flow of monitoring and selecting servers */
    reason?: TopologyDescription;
    constructor(message: string, reason: TopologyDescription);
    get name(): string;
}

/**
 * An error thrown when the user calls a function or method not supported on a tailable cursor
 *
 * @public
 * @category Error
 */
export declare class MongoTailableCursorError extends MongoAPIError {
    constructor(message?: string);
    get name(): string;
}

/**
 * An error generated when an attempt is made to operate on a
 * dropped, or otherwise unavailable, database.
 *
 * @public
 * @category Error
 */
export declare class MongoTopologyClosedError extends MongoAPIError {
    constructor(message?: string);
    get name(): string;
}

/**
 * An error generated when the user makes a mistake in the usage of transactions.
 * (e.g. attempting to commit a transaction with a readPreference other than primary)
 *
 * @public
 * @category Error
 */
export declare class MongoTransactionError extends MongoAPIError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error generated when a **parsable** unexpected response comes from the server.
 * This is generally an error where the driver in a state expecting a certain behavior to occur in
 * the next message from MongoDB but it receives something else.
 * This error **does not** represent an issue with wire message formatting.
 *
 * #### Example
 * When an operation fails, it is the driver's job to retry it. It must perform serverSelection
 * again to make sure that it attempts the operation against a server in a good state. If server
 * selection returns a server that does not support retryable operations, this error is used.
 * This scenario is unlikely as retryable support would also have been determined on the first attempt
 * but it is possible the state change could report a selectable server that does not support retries.
 *
 * @public
 * @category Error
 */
export declare class MongoUnexpectedServerResponseError extends MongoRuntimeError {
    constructor(message: string);
    get name(): string;
}

/**
 * An error thrown when the server reports a writeConcernError
 * @public
 * @category Error
 */
export declare class MongoWriteConcernError extends MongoServerError {
    /** The result document (provided if ok: 1) */
    result?: Document;
    constructor(message: ErrorDescription, result?: Document);
    get name(): string;
}

/* Excluded from this release type: Monitor */

/** @public */
export declare type MonitorEvents = {
    serverHeartbeatStarted(event: ServerHeartbeatStartedEvent): void;
    serverHeartbeatSucceeded(event: ServerHeartbeatSucceededEvent): void;
    serverHeartbeatFailed(event: ServerHeartbeatFailedEvent): void;
    resetServer(error?: MongoError): void;
    resetConnectionPool(): void;
    close(): void;
} & EventEmitterWithState;

/* Excluded from this release type: MonitorInterval */

/* Excluded from this release type: MonitorIntervalOptions */

/** @public */
export declare interface MonitorOptions extends Omit<ConnectionOptions, 'id' | 'generation' | 'hostAddress'> {
    connectTimeoutMS: number;
    heartbeatFrequencyMS: number;
    minHeartbeatFrequencyMS: number;
}

/* Excluded from this release type: MonitorPrivate */

/* Excluded from this release type: Msg */

/**
 * @public
 * returns tuple of strings (keys to be joined on '.') that represent every path into a schema
 * https://docs.mongodb.com/manual/tutorial/query-embedded-documents/
 *
 * @remarks
 * Through testing we determined that a depth of 8 is safe for the typescript compiler
 * and provides reasonable compilation times. This number is otherwise not special and
 * should be changed if issues are found with this level of checking. Beyond this
 * depth any helpers that make use of NestedPaths should devolve to not asserting any
 * type safety on the input.
 */
export declare type NestedPaths<Type, Depth extends number[]> = Depth['length'] extends 8 ? [] : Type extends string | number | boolean | Date | RegExp | Buffer | Uint8Array | ((...args: any[]) => any) | {
    _bsontype: string;
} ? [] : Type extends ReadonlyArray<infer ArrayType> ? [] | [number, ...NestedPaths<ArrayType, [...Depth, 1]>] : Type extends Map<string, any> ? [string] : Type extends object ? {
    [Key in Extract<keyof Type, string>]: Type[Key] extends Type ? [Key] : Type extends Type[Key] ? [Key] : Type[Key] extends ReadonlyArray<infer ArrayType> ? Type extends ArrayType ? [Key] : ArrayType extends Type ? [Key] : [
    Key,
    ...NestedPaths<Type[Key], [...Depth, 1]>
    ] : // child is not structured the same as the parent
    [
    Key,
    ...NestedPaths<Type[Key], [...Depth, 1]>
    ] | [Key];
}[Extract<keyof Type, string>] : [];

/**
 * @public
 * returns keys (strings) for every path into a schema with a value of type
 * https://docs.mongodb.com/manual/tutorial/query-embedded-documents/
 */
export declare type NestedPathsOfType<TSchema, Type> = KeysOfAType<{
    [Property in Join<NestedPaths<TSchema, []>, '.'>]: PropertyType<TSchema, Property>;
}, Type>;

/**
 * @public
 * A type that extends Document but forbids anything that "looks like" an object id.
 */
export declare type NonObjectIdLikeDocument = {
    [key in keyof ObjectIdLike]?: never;
} & Document;

/** It avoids using fields with not acceptable types @public */
export declare type NotAcceptedFields<TSchema, FieldType> = {
    readonly [key in KeysOfOtherType<TSchema, FieldType>]?: never;
};

/** @public */
export declare type NumericType = IntegerType | Decimal128 | Double;

export { ObjectId }

/** @public */
export declare type OneOrMore<T> = T | ReadonlyArray<T>;

/** @public */
export declare type OnlyFieldsOfType<TSchema, FieldType = any, AssignableType = FieldType> = IsAny<TSchema[keyof TSchema], Record<string, FieldType>, AcceptedFields<TSchema, FieldType, AssignableType> & NotAcceptedFields<TSchema, FieldType> & Record<string, AssignableType>>;

/* Excluded from this release type: OperationDescription */

/** @public */
export declare interface OperationOptions extends BSONSerializeOptions {
    /** Specify ClientSession for this command */
    session?: ClientSession;
    willRetryWrite?: boolean;
    /** The preferred read preference (ReadPreference.primary, ReadPreference.primary_preferred, ReadPreference.secondary, ReadPreference.secondary_preferred, ReadPreference.nearest). */
    readPreference?: ReadPreferenceLike;
    /* Excluded from this release type: bypassPinningCheck */
    omitReadPreference?: boolean;
}

/* Excluded from this release type: OperationParent */

/**
 * Represents a specific point in time on a server. Can be retrieved by using `db.command()`
 * @public
 * @see https://docs.mongodb.com/manual/reference/method/db.runCommand/#response
 */
export declare type OperationTime = Timestamp;

/* Excluded from this release type: OpMsgOptions */

/* Excluded from this release type: OpQueryOptions */

/* Excluded from this release type: OpResponseOptions */

/**
 * Add an optional _id field to an object shaped type
 * @public
 */
export declare type OptionalId<TSchema> = EnhancedOmit<TSchema, '_id'> & {
    _id?: InferIdType<TSchema>;
};

/**
 * Adds an optional _id field to an object shaped type, unless the _id field is required on that type.
 * In the case _id is required, this method continues to require_id.
 *
 * @public
 *
 * @privateRemarks
 * `ObjectId extends TSchema['_id']` is a confusing ordering at first glance. Rather than ask
 * `TSchema['_id'] extends ObjectId` which translated to "Is the _id property ObjectId?"
 * we instead ask "Does ObjectId look like (have the same shape) as the _id?"
 */
export declare type OptionalUnlessRequiredId<TSchema> = TSchema extends {
    _id: any;
} ? TSchema : OptionalId<TSchema>;

/** @public */
export declare class OrderedBulkOperation extends BulkOperationBase {
    /* Excluded from this release type: __constructor */
    addToOperationsList(batchType: BatchType, document: Document | UpdateStatement | DeleteStatement): this;
}

/**
 * @public
 * @deprecated This interface is unused and will be removed in the next major version of the driver.
 */
export declare interface PipeOptions {
    end?: boolean;
}

/** @public */
export declare interface PkFactory {
    createPk(): any;
}

/* Excluded from this release type: PoolState */

/** @public */
export declare const ProfilingLevel: Readonly<{
    readonly off: "off";
    readonly slowOnly: "slow_only";
    readonly all: "all";
}>;

/** @public */
export declare type ProfilingLevel = typeof ProfilingLevel[keyof typeof ProfilingLevel];

/** @public */
export declare type ProfilingLevelOptions = CommandOperationOptions;

/**
 * @public
 * Projection is flexible to permit the wide array of aggregation operators
 * @deprecated since v4.1.0: Since projections support all aggregation operations we have no plans to narrow this type further
 */
export declare type Projection<TSchema extends Document = Document> = Document;

/**
 * @public
 * @deprecated since v4.1.0: Since projections support all aggregation operations we have no plans to narrow this type further
 */
export declare type ProjectionOperators = Document;

/**
 * Global promise store allowing user-provided promises
 * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
 * @public
 */
declare class Promise_2 {
    /**
     * Validates the passed in promise library
     * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
     */
    static validate(lib: unknown): lib is PromiseConstructor;
    /**
     * Sets the promise library
     * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
     */
    static set(lib: PromiseConstructor | null): void;
    /**
     * Get the stored promise library, or resolves passed in
     * @deprecated Setting a custom promise library is deprecated the next major version will use the global Promise constructor only.
     */
    static get(): PromiseConstructor | null;
}
export { Promise_2 as Promise }

/** @public */
export declare type PropertyType<Type, Property extends string> = string extends Property ? unknown : Property extends keyof Type ? Type[Property] : Property extends `${number}` ? Type extends ReadonlyArray<infer ArrayType> ? ArrayType : unknown : Property extends `${infer Key}.${infer Rest}` ? Key extends `${number}` ? Type extends ReadonlyArray<infer ArrayType> ? PropertyType<ArrayType, Rest> : unknown : Key extends keyof Type ? Type[Key] extends Map<string, infer MapType> ? MapType : PropertyType<Type[Key], Rest> : unknown : unknown;

/** @public */
export declare interface ProxyOptions {
    proxyHost?: string;
    proxyPort?: number;
    proxyUsername?: string;
    proxyPassword?: string;
}

/** @public */
export declare type PullAllOperator<TSchema> = ({
    readonly [key in KeysOfAType<TSchema, ReadonlyArray<any>>]?: TSchema[key];
} & NotAcceptedFields<TSchema, ReadonlyArray<any>>) & {
    readonly [key: string]: ReadonlyArray<any>;
};

/** @public */
export declare type PullOperator<TSchema> = ({
    readonly [key in KeysOfAType<TSchema, ReadonlyArray<any>>]?: Partial<Flatten<TSchema[key]>> | FilterOperations<Flatten<TSchema[key]>>;
} & NotAcceptedFields<TSchema, ReadonlyArray<any>>) & {
    readonly [key: string]: FilterOperators<any> | any;
};

/** @public */
export declare type PushOperator<TSchema> = ({
    readonly [key in KeysOfAType<TSchema, ReadonlyArray<any>>]?: Flatten<TSchema[key]> | ArrayOperator<Array<Flatten<TSchema[key]>>>;
} & NotAcceptedFields<TSchema, ReadonlyArray<any>>) & {
    readonly [key: string]: ArrayOperator<any> | any;
};

/* Excluded from this release type: Query */

/**
 * The MongoDB ReadConcern, which allows for control of the consistency and isolation properties
 * of the data read from replica sets and replica set shards.
 * @public
 *
 * @see https://docs.mongodb.com/manual/reference/read-concern/index.html
 */
export declare class ReadConcern {
    level: ReadConcernLevel | string;
    /** Constructs a ReadConcern from the read concern level.*/
    constructor(level: ReadConcernLevel);
    /**
     * Construct a ReadConcern given an options object.
     *
     * @param options - The options object from which to extract the write concern.
     */
    static fromOptions(options?: {
        readConcern?: ReadConcernLike;
        level?: ReadConcernLevel;
    }): ReadConcern | undefined;
    static get MAJORITY(): 'majority';
    static get AVAILABLE(): 'available';
    static get LINEARIZABLE(): 'linearizable';
    static get SNAPSHOT(): 'snapshot';
    toJSON(): Document;
}

/** @public */
export declare const ReadConcernLevel: Readonly<{
    readonly local: "local";
    readonly majority: "majority";
    readonly linearizable: "linearizable";
    readonly available: "available";
    readonly snapshot: "snapshot";
}>;

/** @public */
export declare type ReadConcernLevel = typeof ReadConcernLevel[keyof typeof ReadConcernLevel];

/** @public */
export declare type ReadConcernLike = ReadConcern | {
    level: ReadConcernLevel;
} | ReadConcernLevel;

/**
 * The **ReadPreference** class is a class that represents a MongoDB ReadPreference and is
 * used to construct connections.
 * @public
 *
 * @see https://docs.mongodb.com/manual/core/read-preference/
 */
export declare class ReadPreference {
    mode: ReadPreferenceMode;
    tags?: TagSet[];
    hedge?: HedgeOptions;
    maxStalenessSeconds?: number;
    minWireVersion?: number;
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
    /**
     * @param mode - A string describing the read preference mode (primary|primaryPreferred|secondary|secondaryPreferred|nearest)
     * @param tags - A tag set used to target reads to members with the specified tag(s). tagSet is not available if using read preference mode primary.
     * @param options - Additional read preference options
     */
    constructor(mode: ReadPreferenceMode, tags?: TagSet[], options?: ReadPreferenceOptions);
    get preference(): ReadPreferenceMode;
    static fromString(mode: string): ReadPreference;
    /**
     * Construct a ReadPreference given an options object.
     *
     * @param options - The options object from which to extract the read preference.
     */
    static fromOptions(options?: ReadPreferenceFromOptions): ReadPreference | undefined;
    /**
     * Replaces options.readPreference with a ReadPreference instance
     */
    static translate(options: ReadPreferenceLikeOptions): ReadPreferenceLikeOptions;
    /**
     * Validate if a mode is legal
     *
     * @param mode - The string representing the read preference mode.
     */
    static isValid(mode: string): boolean;
    /**
     * Validate if a mode is legal
     *
     * @param mode - The string representing the read preference mode.
     */
    isValid(mode?: string): boolean;
    /**
     * Indicates that this readPreference needs the "secondaryOk" bit when sent over the wire
     * @deprecated Use secondaryOk instead
     * @see https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/#op-query
     */
    slaveOk(): boolean;
    /**
     * Indicates that this readPreference needs the "SecondaryOk" bit when sent over the wire
     * @see https://docs.mongodb.com/manual/reference/mongodb-wire-protocol/#op-query
     */
    secondaryOk(): boolean;
    /**
     * Check if the two ReadPreferences are equivalent
     *
     * @param readPreference - The read preference with which to check equality
     */
    equals(readPreference: ReadPreference): boolean;
    /** Return JSON representation */
    toJSON(): Document;
}

/** @public */
export declare interface ReadPreferenceFromOptions extends ReadPreferenceLikeOptions {
    session?: ClientSession;
    readPreferenceTags?: TagSet[];
    hedge?: HedgeOptions;
}

/** @public */
export declare type ReadPreferenceLike = ReadPreference | ReadPreferenceMode;

/** @public */
export declare interface ReadPreferenceLikeOptions extends ReadPreferenceOptions {
    readPreference?: ReadPreferenceLike | {
        mode?: ReadPreferenceMode;
        preference?: ReadPreferenceMode;
        tags?: TagSet[];
        maxStalenessSeconds?: number;
    };
}

/** @public */
export declare const ReadPreferenceMode: Readonly<{
    readonly primary: "primary";
    readonly primaryPreferred: "primaryPreferred";
    readonly secondary: "secondary";
    readonly secondaryPreferred: "secondaryPreferred";
    readonly nearest: "nearest";
}>;

/** @public */
export declare type ReadPreferenceMode = typeof ReadPreferenceMode[keyof typeof ReadPreferenceMode];

/** @public */
export declare interface ReadPreferenceOptions {
    /** Max secondary read staleness in seconds, Minimum value is 90 seconds.*/
    maxStalenessSeconds?: number;
    /** Server mode in which the same query is dispatched in parallel to multiple replica set members. */
    hedge?: HedgeOptions;
}

/** @public */
export declare type ReduceFunction<TKey = ObjectId, TValue = any> = (key: TKey, values: TValue[]) => TValue;

/** @public */
export declare type RegExpOrString<T> = T extends string ? BSONRegExp | RegExp | T : T;

/** @public */
export declare type RemoveUserOptions = CommandOperationOptions;

/** @public */
export declare interface RenameOptions extends CommandOperationOptions {
    /** Drop the target name collection if it previously exists. */
    dropTarget?: boolean;
    /** Unclear */
    new_collection?: boolean;
}

/** @public */
export declare interface ReplaceOneModel<TSchema extends Document = Document> {
    /** The filter to limit the replaced document. */
    filter: Filter<TSchema>;
    /** The document with which to replace the matched document. */
    replacement: WithoutId<TSchema>;
    /** Specifies a collation. */
    collation?: CollationOptions;
    /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
    hint?: Hint;
    /** When true, creates a new document if no document matches the query. */
    upsert?: boolean;
}

/** @public */
export declare interface ReplaceOptions extends CommandOperationOptions {
    /** If true, allows the write to opt-out of document level validation */
    bypassDocumentValidation?: boolean;
    /** Specifies a collation */
    collation?: CollationOptions;
    /** Specify that the update query should only consider plans using the hinted index */
    hint?: string | Document;
    /** When true, creates a new document if no document matches the query */
    upsert?: boolean;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
}

/* Excluded from this release type: Response */

/**
 * @public
 * @deprecated Please use the ChangeStreamCursorOptions type instead.
 */
export declare interface ResumeOptions {
    startAtOperationTime?: Timestamp;
    batchSize?: number;
    maxAwaitTimeMS?: number;
    collation?: CollationOptions;
    readPreference?: ReadPreference;
    resumeAfter?: ResumeToken;
    startAfter?: ResumeToken;
    fullDocument?: string;
}

/**
 * Represents the logical starting point for a new ChangeStream or resuming a ChangeStream on the server.
 * @see https://www.mongodb.com/docs/manual/changeStreams/#std-label-change-stream-resume
 * @public
 */
export declare type ResumeToken = unknown;

/** @public */
export declare const ReturnDocument: Readonly<{
    readonly BEFORE: "before";
    readonly AFTER: "after";
}>;

/** @public */
export declare type ReturnDocument = typeof ReturnDocument[keyof typeof ReturnDocument];

/** @public */
export declare interface RoleSpecification {
    /**
     * A role grants privileges to perform sets of actions on defined resources.
     * A given role applies to the database on which it is defined and can grant access down to a collection level of granularity.
     */
    role: string;
    /** The database this user's role should effect. */
    db: string;
}

/** @public */
export declare interface RootFilterOperators<TSchema> extends Document {
    $and?: Filter<TSchema>[];
    $nor?: Filter<TSchema>[];
    $or?: Filter<TSchema>[];
    $text?: {
        $search: string;
        $language?: string;
        $caseSensitive?: boolean;
        $diacriticSensitive?: boolean;
    };
    $where?: string | ((this: TSchema) => boolean);
    $comment?: string | Document;
}

/* Excluded from this release type: RTTPinger */

/* Excluded from this release type: RTTPingerOptions */

/** @public */
export declare type RunCommandOptions = CommandOperationOptions;

/** @public */
export declare type SchemaMember<T, V> = {
    [P in keyof T]?: V;
} | {
    [key: string]: V;
};

/** @public */
export declare interface SelectServerOptions {
    readPreference?: ReadPreferenceLike;
    /** How long to block for server selection before throwing an error */
    serverSelectionTimeoutMS?: number;
    session?: ClientSession;
}

/* Excluded from this release type: serialize */

/* Excluded from this release type: Server */

/** @public */
export declare interface ServerApi {
    version: ServerApiVersion;
    strict?: boolean;
    deprecationErrors?: boolean;
}

/** @public */
export declare const ServerApiVersion: Readonly<{
    readonly v1: "1";
}>;

/** @public */
export declare type ServerApiVersion = typeof ServerApiVersion[keyof typeof ServerApiVersion];

/** @public */
export declare class ServerCapabilities {
    maxWireVersion: number;
    minWireVersion: number;
    constructor(hello: Document);
    get hasAggregationCursor(): boolean;
    get hasWriteCommands(): boolean;
    get hasTextSearch(): boolean;
    get hasAuthCommands(): boolean;
    get hasListCollectionsCommand(): boolean;
    get hasListIndexesCommand(): boolean;
    get supportsSnapshotReads(): boolean;
    get commandsTakeWriteConcern(): boolean;
    get commandsTakeCollation(): boolean;
}

/**
 * Emitted when server is closed.
 * @public
 * @category Event
 */
export declare class ServerClosedEvent {
    /** A unique identifier for the topology */
    topologyId: number;
    /** The address (host/port pair) of the server */
    address: string;
    /* Excluded from this release type: __constructor */
}

/**
 * The client's view of a single server, based on the most recent hello outcome.
 *
 * Internal type, not meant to be directly instantiated
 * @public
 */
export declare class ServerDescription {
    address: string;
    type: ServerType;
    hosts: string[];
    passives: string[];
    arbiters: string[];
    tags: TagSet;
    error: MongoError | null;
    topologyVersion: TopologyVersion | null;
    minWireVersion: number;
    maxWireVersion: number;
    roundTripTime: number;
    lastUpdateTime: number;
    lastWriteDate: number;
    me: string | null;
    primary: string | null;
    setName: string | null;
    setVersion: number | null;
    electionId: ObjectId | null;
    logicalSessionTimeoutMinutes: number | null;
    $clusterTime?: ClusterTime;
    /* Excluded from this release type: __constructor */
    get hostAddress(): HostAddress;
    get allHosts(): string[];
    /** Is this server available for reads*/
    get isReadable(): boolean;
    /** Is this server data bearing */
    get isDataBearing(): boolean;
    /** Is this server available for writes */
    get isWritable(): boolean;
    get host(): string;
    get port(): number;
    /**
     * Determines if another `ServerDescription` is equal to this one per the rules defined
     * in the {@link https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#serverdescription|SDAM spec}
     */
    equals(other?: ServerDescription | null): boolean;
}

/**
 * Emitted when server description changes, but does NOT include changes to the RTT.
 * @public
 * @category Event
 */
export declare class ServerDescriptionChangedEvent {
    /** A unique identifier for the topology */
    topologyId: number;
    /** The address (host/port pair) of the server */
    address: string;
    /** The previous server description */
    previousDescription: ServerDescription;
    /** The new server description */
    newDescription: ServerDescription;
    /* Excluded from this release type: __constructor */
}

/* Excluded from this release type: ServerDescriptionOptions */

/** @public */
export declare type ServerEvents = {
    serverHeartbeatStarted(event: ServerHeartbeatStartedEvent): void;
    serverHeartbeatSucceeded(event: ServerHeartbeatSucceededEvent): void;
    serverHeartbeatFailed(event: ServerHeartbeatFailedEvent): void;
    /* Excluded from this release type: connect */
    descriptionReceived(description: ServerDescription): void;
    closed(): void;
    ended(): void;
} & ConnectionPoolEvents & EventEmitterWithState;

/**
 * Emitted when the server monitor’s hello fails, either with an “ok: 0” or a socket exception.
 * @public
 * @category Event
 */
export declare class ServerHeartbeatFailedEvent {
    /** The connection id for the command */
    connectionId: string;
    /** The execution time of the event in ms */
    duration: number;
    /** The command failure */
    failure: Error;
    /* Excluded from this release type: __constructor */
}

/**
 * Emitted when the server monitor’s hello command is started - immediately before
 * the hello command is serialized into raw BSON and written to the socket.
 *
 * @public
 * @category Event
 */
export declare class ServerHeartbeatStartedEvent {
    /** The connection id for the command */
    connectionId: string;
    /* Excluded from this release type: __constructor */
}

/**
 * Emitted when the server monitor’s hello succeeds.
 * @public
 * @category Event
 */
export declare class ServerHeartbeatSucceededEvent {
    /** The connection id for the command */
    connectionId: string;
    /** The execution time of the event in ms */
    duration: number;
    /** The command reply */
    reply: Document;
    /* Excluded from this release type: __constructor */
}

/**
 * Emitted when server is initialized.
 * @public
 * @category Event
 */
export declare class ServerOpeningEvent {
    /** A unique identifier for the topology */
    topologyId: number;
    /** The address (host/port pair) of the server */
    address: string;
    /* Excluded from this release type: __constructor */
}

/** @public */
export declare type ServerOptions = Omit<ConnectionPoolOptions, 'id' | 'generation' | 'hostAddress'> & MonitorOptions;

/* Excluded from this release type: ServerPrivate */

/* Excluded from this release type: ServerSelectionCallback */

/* Excluded from this release type: ServerSelectionRequest */

/** @public */
export declare type ServerSelector = (topologyDescription: TopologyDescription, servers: ServerDescription[]) => ServerDescription[];

/**
 * Reflects the existence of a session on the server. Can be reused by the session pool.
 * WARNING: not meant to be instantiated directly. For internal use only.
 * @public
 */
export declare class ServerSession {
    id: ServerSessionId;
    lastUse: number;
    txnNumber: number;
    isDirty: boolean;
    /* Excluded from this release type: __constructor */
    /**
     * Determines if the server session has timed out.
     *
     * @param sessionTimeoutMinutes - The server's "logicalSessionTimeoutMinutes"
     */
    hasTimedOut(sessionTimeoutMinutes: number): boolean;
    /* Excluded from this release type: clone */
}

/** @public */
export declare type ServerSessionId = {
    id: Binary;
};

/* Excluded from this release type: ServerSessionPool */

/**
 * An enumeration of server types we know about
 * @public
 */
export declare const ServerType: Readonly<{
    readonly Standalone: "Standalone";
    readonly Mongos: "Mongos";
    readonly PossiblePrimary: "PossiblePrimary";
    readonly RSPrimary: "RSPrimary";
    readonly RSSecondary: "RSSecondary";
    readonly RSArbiter: "RSArbiter";
    readonly RSOther: "RSOther";
    readonly RSGhost: "RSGhost";
    readonly Unknown: "Unknown";
    readonly LoadBalancer: "LoadBalancer";
}>;

/** @public */
export declare type ServerType = typeof ServerType[keyof typeof ServerType];

/** @public */
export declare type SetFields<TSchema> = ({
    readonly [key in KeysOfAType<TSchema, ReadonlyArray<any> | undefined>]?: OptionalId<Flatten<TSchema[key]>> | AddToSetOperators<Array<OptionalId<Flatten<TSchema[key]>>>>;
} & NotAcceptedFields<TSchema, ReadonlyArray<any> | undefined>) & {
    readonly [key: string]: AddToSetOperators<any> | any;
};

/** @public */
export declare type SetProfilingLevelOptions = CommandOperationOptions;

/* Excluded from this release type: SeverityLevel */

/** @public */
export declare type Sort = string | Exclude<SortDirection, {
    $meta: string;
}> | string[] | {
    [key: string]: SortDirection;
} | Map<string, SortDirection> | [string, SortDirection][] | [string, SortDirection];

/** @public */
export declare type SortDirection = 1 | -1 | 'asc' | 'desc' | 'ascending' | 'descending' | {
    $meta: string;
};

/* Excluded from this release type: SortDirectionForCmd */

/* Excluded from this release type: SortForCmd */

/* Excluded from this release type: SrvPoller */

/* Excluded from this release type: SrvPollerEvents */

/* Excluded from this release type: SrvPollerOptions */

/* Excluded from this release type: SrvPollingEvent */

/** @public */
export declare type Stream = Socket | TLSSocket;

/** @public */
export declare class StreamDescription {
    address: string;
    type: string;
    minWireVersion?: number;
    maxWireVersion?: number;
    maxBsonObjectSize: number;
    maxMessageSizeBytes: number;
    maxWriteBatchSize: number;
    compressors: CompressorName[];
    compressor?: CompressorName;
    logicalSessionTimeoutMinutes?: number;
    loadBalanced: boolean;
    __nodejs_mock_server__?: boolean;
    zlibCompressionLevel?: number;
    constructor(address: string, options?: StreamDescriptionOptions);
    receiveResponse(response: Document | null): void;
}

/** @public */
export declare interface StreamDescriptionOptions {
    compressors?: CompressorName[];
    logicalSessionTimeoutMinutes?: number;
    loadBalanced: boolean;
}

/** @public */
export declare type SupportedNodeConnectionOptions = SupportedTLSConnectionOptions & SupportedTLSSocketOptions & SupportedSocketOptions;

/** @public */
export declare type SupportedSocketOptions = Pick<TcpNetConnectOpts, typeof LEGAL_TCP_SOCKET_OPTIONS[number]>;

/** @public */
export declare type SupportedTLSConnectionOptions = Pick<ConnectionOptions_2, Extract<keyof ConnectionOptions_2, typeof LEGAL_TLS_SOCKET_OPTIONS[number]>>;

/** @public */
export declare type SupportedTLSSocketOptions = Pick<TLSSocketOptions, Extract<keyof TLSSocketOptions, typeof LEGAL_TLS_SOCKET_OPTIONS[number]>>;

/** @public */
export declare type TagSet = {
    [key: string]: string;
};

/* Excluded from this release type: TimerQueue */

/** @public
 * Configuration options for timeseries collections
 * @see https://docs.mongodb.com/manual/core/timeseries-collections/
 */
export declare interface TimeSeriesCollectionOptions extends Document {
    timeField: string;
    metaField?: string;
    granularity?: 'seconds' | 'minutes' | 'hours' | string;
}

export { Timestamp }

/* Excluded from this release type: Topology */

/**
 * Emitted when topology is closed.
 * @public
 * @category Event
 */
export declare class TopologyClosedEvent {
    /** A unique identifier for the topology */
    topologyId: number;
    /* Excluded from this release type: __constructor */
}

/**
 * Representation of a deployment of servers
 * @public
 */
export declare class TopologyDescription {
    type: TopologyType;
    setName: string | null;
    maxSetVersion: number | null;
    maxElectionId: ObjectId | null;
    servers: Map<string, ServerDescription>;
    stale: boolean;
    compatible: boolean;
    compatibilityError?: string;
    logicalSessionTimeoutMinutes: number | null;
    heartbeatFrequencyMS: number;
    localThresholdMS: number;
    commonWireVersion: number;
    /**
     * Create a TopologyDescription
     */
    constructor(topologyType: TopologyType, serverDescriptions?: Map<string, ServerDescription> | null, setName?: string | null, maxSetVersion?: number | null, maxElectionId?: ObjectId | null, commonWireVersion?: number | null, options?: TopologyDescriptionOptions | null);
    /* Excluded from this release type: updateFromSrvPollingEvent */
    /* Excluded from this release type: update */
    get error(): MongoServerError | null;
    /**
     * Determines if the topology description has any known servers
     */
    get hasKnownServers(): boolean;
    /**
     * Determines if this topology description has a data-bearing server available.
     */
    get hasDataBearingServers(): boolean;
    /* Excluded from this release type: hasServer */
}

/**
 * Emitted when topology description changes.
 * @public
 * @category Event
 */
export declare class TopologyDescriptionChangedEvent {
    /** A unique identifier for the topology */
    topologyId: number;
    /** The old topology description */
    previousDescription: TopologyDescription;
    /** The new topology description */
    newDescription: TopologyDescription;
    /* Excluded from this release type: __constructor */
}

/** @public */
export declare interface TopologyDescriptionOptions {
    heartbeatFrequencyMS?: number;
    localThresholdMS?: number;
}

/** @public */
export declare type TopologyEvents = {
    /* Excluded from this release type: connect */
    serverOpening(event: ServerOpeningEvent): void;
    serverClosed(event: ServerClosedEvent): void;
    serverDescriptionChanged(event: ServerDescriptionChangedEvent): void;
    topologyClosed(event: TopologyClosedEvent): void;
    topologyOpening(event: TopologyOpeningEvent): void;
    topologyDescriptionChanged(event: TopologyDescriptionChangedEvent): void;
    error(error: Error): void;
    /* Excluded from this release type: open */
    close(): void;
    timeout(): void;
} & Omit<ServerEvents, 'connect'> & ConnectionPoolEvents & ConnectionEvents & EventEmitterWithState;

/**
 * Emitted when topology is initialized.
 * @public
 * @category Event
 */
export declare class TopologyOpeningEvent {
    /** A unique identifier for the topology */
    topologyId: number;
    /* Excluded from this release type: __constructor */
}

/** @public */
export declare interface TopologyOptions extends BSONSerializeOptions, ServerOptions {
    srvMaxHosts: number;
    srvServiceName: string;
    hosts: HostAddress[];
    retryWrites: boolean;
    retryReads: boolean;
    /** How long to block for server selection before throwing an error */
    serverSelectionTimeoutMS: number;
    /** The name of the replica set to connect to */
    replicaSet?: string;
    srvHost?: string;
    /* Excluded from this release type: srvPoller */
    /** Indicates that a client should directly connect to a node without attempting to discover its topology type */
    directConnection: boolean;
    loadBalanced: boolean;
    metadata: ClientMetadata;
    /** MongoDB server API version */
    serverApi?: ServerApi;
    /* Excluded from this release type: __index */
}

/* Excluded from this release type: TopologyPrivate */

/**
 * An enumeration of topology types we know about
 * @public
 */
export declare const TopologyType: Readonly<{
    readonly Single: "Single";
    readonly ReplicaSetNoPrimary: "ReplicaSetNoPrimary";
    readonly ReplicaSetWithPrimary: "ReplicaSetWithPrimary";
    readonly Sharded: "Sharded";
    readonly Unknown: "Unknown";
    readonly LoadBalanced: "LoadBalanced";
}>;

/** @public */
export declare type TopologyType = typeof TopologyType[keyof typeof TopologyType];

/** @public */
export declare interface TopologyVersion {
    processId: ObjectId;
    counter: Long;
}

/**
 * @public
 * A class maintaining state related to a server transaction. Internal Only
 */
export declare class Transaction {
    /* Excluded from this release type: state */
    options: TransactionOptions;
    /* Excluded from this release type: _pinnedServer */
    /* Excluded from this release type: _recoveryToken */
    /* Excluded from this release type: __constructor */
    /* Excluded from this release type: server */
    get recoveryToken(): Document | undefined;
    get isPinned(): boolean;
    /** @returns Whether the transaction has started */
    get isStarting(): boolean;
    /**
     * @returns Whether this session is presently in a transaction
     */
    get isActive(): boolean;
    get isCommitted(): boolean;
    /* Excluded from this release type: transition */
    /* Excluded from this release type: pinServer */
    /* Excluded from this release type: unpinServer */
}

/**
 * Configuration options for a transaction.
 * @public
 */
export declare interface TransactionOptions extends CommandOperationOptions {
    /** A default read concern for commands in this transaction */
    readConcern?: ReadConcernLike;
    /** A default writeConcern for commands in this transaction */
    writeConcern?: WriteConcern;
    /** A default read preference for commands in this transaction */
    readPreference?: ReadPreferenceLike;
    /** Specifies the maximum amount of time to allow a commit action on a transaction to run in milliseconds */
    maxCommitTimeMS?: number;
}

/* Excluded from this release type: TxnState */

/**
 * Typescript type safe event emitter
 * @public
 */
export declare interface TypedEventEmitter<Events extends EventsDescription> extends EventEmitter {
    addListener<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
    addListener(event: CommonEvents, listener: (eventName: string | symbol, listener: GenericListener) => void): this;
    addListener(event: string | symbol, listener: GenericListener): this;
    on<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
    on(event: CommonEvents, listener: (eventName: string | symbol, listener: GenericListener) => void): this;
    on(event: string | symbol, listener: GenericListener): this;
    once<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
    once(event: CommonEvents, listener: (eventName: string | symbol, listener: GenericListener) => void): this;
    once(event: string | symbol, listener: GenericListener): this;
    removeListener<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
    removeListener(event: CommonEvents, listener: (eventName: string | symbol, listener: GenericListener) => void): this;
    removeListener(event: string | symbol, listener: GenericListener): this;
    off<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
    off(event: CommonEvents, listener: (eventName: string | symbol, listener: GenericListener) => void): this;
    off(event: string | symbol, listener: GenericListener): this;
    removeAllListeners<EventKey extends keyof Events>(event?: EventKey | CommonEvents | symbol | string): this;
    listeners<EventKey extends keyof Events>(event: EventKey | CommonEvents | symbol | string): Events[EventKey][];
    rawListeners<EventKey extends keyof Events>(event: EventKey | CommonEvents | symbol | string): Events[EventKey][];
    emit<EventKey extends keyof Events>(event: EventKey | symbol, ...args: Parameters<Events[EventKey]>): boolean;
    listenerCount<EventKey extends keyof Events>(type: EventKey | CommonEvents | symbol | string): number;
    prependListener<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
    prependListener(event: CommonEvents, listener: (eventName: string | symbol, listener: GenericListener) => void): this;
    prependListener(event: string | symbol, listener: GenericListener): this;
    prependOnceListener<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
    prependOnceListener(event: CommonEvents, listener: (eventName: string | symbol, listener: GenericListener) => void): this;
    prependOnceListener(event: string | symbol, listener: GenericListener): this;
    eventNames(): string[];
    getMaxListeners(): number;
    setMaxListeners(n: number): this;
}

/**
 * Typescript type safe event emitter
 * @public
 */
export declare class TypedEventEmitter<Events extends EventsDescription> extends EventEmitter {
}

/** @public */
export declare class UnorderedBulkOperation extends BulkOperationBase {
    /* Excluded from this release type: __constructor */
    handleWriteError(callback: Callback, writeResult: BulkWriteResult): boolean;
    addToOperationsList(batchType: BatchType, document: Document | UpdateStatement | DeleteStatement): this;
}

/** @public */
export declare interface UpdateDescription<TSchema extends Document = Document> {
    /**
     * A document containing key:value pairs of names of the fields that were
     * changed, and the new value for those fields.
     */
    updatedFields?: Partial<TSchema>;
    /**
     * An array of field names that were removed from the document.
     */
    removedFields?: string[];
    /**
     * An array of documents which record array truncations performed with pipeline-based updates using one or more of the following stages:
     * - $addFields
     * - $set
     * - $replaceRoot
     * - $replaceWith
     */
    truncatedArrays?: Array<{
        /** The name of the truncated field. */
        field: string;
        /** The number of elements in the truncated array. */
        newSize: number;
    }>;
    /**
     * A document containing additional information about any ambiguous update paths from the update event.  The document
     * maps the full ambiguous update path to an array containing the actual resolved components of the path.  For example,
     * given a document shaped like `{ a: { '0': 0 } }`, and an update of `{ $inc: 'a.0' }`, disambiguated paths would look like
     * the following:
     *
     * ```
     *   {
     *     'a.0': ['a', '0']
     *   }
     * ```
     *
     * This field is only present when there are ambiguous paths that are updated as a part of the update event and `showExpandedEvents`
     * is enabled for the change stream.
     * @sinceServerVersion 6.1.0
     */
    disambiguatedPaths?: Document;
}

/** @public */
export declare type UpdateFilter<TSchema> = {
    $currentDate?: OnlyFieldsOfType<TSchema, Date | Timestamp, true | {
        $type: 'date' | 'timestamp';
    }>;
    $inc?: OnlyFieldsOfType<TSchema, NumericType | undefined>;
    $min?: MatchKeysAndValues<TSchema>;
    $max?: MatchKeysAndValues<TSchema>;
    $mul?: OnlyFieldsOfType<TSchema, NumericType | undefined>;
    $rename?: Record<string, string>;
    $set?: MatchKeysAndValues<TSchema>;
    $setOnInsert?: MatchKeysAndValues<TSchema>;
    $unset?: OnlyFieldsOfType<TSchema, any, '' | true | 1>;
    $addToSet?: SetFields<TSchema>;
    $pop?: OnlyFieldsOfType<TSchema, ReadonlyArray<any>, 1 | -1>;
    $pull?: PullOperator<TSchema>;
    $push?: PushOperator<TSchema>;
    $pullAll?: PullAllOperator<TSchema>;
    $bit?: OnlyFieldsOfType<TSchema, NumericType | undefined, {
        and: IntegerType;
    } | {
        or: IntegerType;
    } | {
        xor: IntegerType;
    }>;
} & Document;

/** @public */
export declare interface UpdateManyModel<TSchema extends Document = Document> {
    /** The filter to limit the updated documents. */
    filter: Filter<TSchema>;
    /** A document or pipeline containing update operators. */
    update: UpdateFilter<TSchema> | UpdateFilter<TSchema>[];
    /** A set of filters specifying to which array elements an update should apply. */
    arrayFilters?: Document[];
    /** Specifies a collation. */
    collation?: CollationOptions;
    /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
    hint?: Hint;
    /** When true, creates a new document if no document matches the query. */
    upsert?: boolean;
}

/** @public */
export declare interface UpdateOneModel<TSchema extends Document = Document> {
    /** The filter to limit the updated documents. */
    filter: Filter<TSchema>;
    /** A document or pipeline containing update operators. */
    update: UpdateFilter<TSchema> | UpdateFilter<TSchema>[];
    /** A set of filters specifying to which array elements an update should apply. */
    arrayFilters?: Document[];
    /** Specifies a collation. */
    collation?: CollationOptions;
    /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
    hint?: Hint;
    /** When true, creates a new document if no document matches the query. */
    upsert?: boolean;
}

/** @public */
export declare interface UpdateOptions extends CommandOperationOptions {
    /** A set of filters specifying to which array elements an update should apply */
    arrayFilters?: Document[];
    /** If true, allows the write to opt-out of document level validation */
    bypassDocumentValidation?: boolean;
    /** Specifies a collation */
    collation?: CollationOptions;
    /** Specify that the update query should only consider plans using the hinted index */
    hint?: Hint;
    /** When true, creates a new document if no document matches the query */
    upsert?: boolean;
    /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
    let?: Document;
}

/** @public */
export declare interface UpdateResult {
    /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
    acknowledged: boolean;
    /** The number of documents that matched the filter */
    matchedCount: number;
    /** The number of documents that were modified */
    modifiedCount: number;
    /** The number of documents that were upserted */
    upsertedCount: number;
    /** The identifier of the inserted document if an upsert took place */
    upsertedId: ObjectId;
}

/** @public */
export declare interface UpdateStatement {
    /** The query that matches documents to update. */
    q: Document;
    /** The modifications to apply. */
    u: Document | Document[];
    /**  If true, perform an insert if no documents match the query. */
    upsert?: boolean;
    /** If true, updates all documents that meet the query criteria. */
    multi?: boolean;
    /** Specifies the collation to use for the operation. */
    collation?: CollationOptions;
    /** An array of filter documents that determines which array elements to modify for an update operation on an array field. */
    arrayFilters?: Document[];
    /** A document or string that specifies the index to use to support the query predicate. */
    hint?: Hint;
}

/** @public */
export declare interface ValidateCollectionOptions extends CommandOperationOptions {
    /** Validates a collection in the background, without interrupting read or write traffic (only in MongoDB 4.4+) */
    background?: boolean;
}

/** @public */
export declare type W = number | 'majority';

/* Excluded from this release type: WaitQueueMember */

/** @public */
export declare interface WiredTigerData extends Document {
    LSM: {
        'bloom filter false positives': number;
        'bloom filter hits': number;
        'bloom filter misses': number;
        'bloom filter pages evicted from cache': number;
        'bloom filter pages read into cache': number;
        'bloom filters in the LSM tree': number;
        'chunks in the LSM tree': number;
        'highest merge generation in the LSM tree': number;
        'queries that could have benefited from a Bloom filter that did not exist': number;
        'sleep for LSM checkpoint throttle': number;
        'sleep for LSM merge throttle': number;
        'total size of bloom filters': number;
    } & Document;
    'block-manager': {
        'allocations requiring file extension': number;
        'blocks allocated': number;
        'blocks freed': number;
        'checkpoint size': number;
        'file allocation unit size': number;
        'file bytes available for reuse': number;
        'file magic number': number;
        'file major version number': number;
        'file size in bytes': number;
        'minor version number': number;
    };
    btree: {
        'btree checkpoint generation': number;
        'column-store fixed-size leaf pages': number;
        'column-store internal pages': number;
        'column-store variable-size RLE encoded values': number;
        'column-store variable-size deleted values': number;
        'column-store variable-size leaf pages': number;
        'fixed-record size': number;
        'maximum internal page key size': number;
        'maximum internal page size': number;
        'maximum leaf page key size': number;
        'maximum leaf page size': number;
        'maximum leaf page value size': number;
        'maximum tree depth': number;
        'number of key/value pairs': number;
        'overflow pages': number;
        'pages rewritten by compaction': number;
        'row-store internal pages': number;
        'row-store leaf pages': number;
    } & Document;
    cache: {
        'bytes currently in the cache': number;
        'bytes read into cache': number;
        'bytes written from cache': number;
        'checkpoint blocked page eviction': number;
        'data source pages selected for eviction unable to be evicted': number;
        'hazard pointer blocked page eviction': number;
        'in-memory page passed criteria to be split': number;
        'in-memory page splits': number;
        'internal pages evicted': number;
        'internal pages split during eviction': number;
        'leaf pages split during eviction': number;
        'modified pages evicted': number;
        'overflow pages read into cache': number;
        'overflow values cached in memory': number;
        'page split during eviction deepened the tree': number;
        'page written requiring lookaside records': number;
        'pages read into cache': number;
        'pages read into cache requiring lookaside entries': number;
        'pages requested from the cache': number;
        'pages written from cache': number;
        'pages written requiring in-memory restoration': number;
        'tracked dirty bytes in the cache': number;
        'unmodified pages evicted': number;
    } & Document;
    cache_walk: {
        'Average difference between current eviction generation when the page was last considered': number;
        'Average on-disk page image size seen': number;
        'Clean pages currently in cache': number;
        'Current eviction generation': number;
        'Dirty pages currently in cache': number;
        'Entries in the root page': number;
        'Internal pages currently in cache': number;
        'Leaf pages currently in cache': number;
        'Maximum difference between current eviction generation when the page was last considered': number;
        'Maximum page size seen': number;
        'Minimum on-disk page image size seen': number;
        'On-disk page image sizes smaller than a single allocation unit': number;
        'Pages created in memory and never written': number;
        'Pages currently queued for eviction': number;
        'Pages that could not be queued for eviction': number;
        'Refs skipped during cache traversal': number;
        'Size of the root page': number;
        'Total number of pages currently in cache': number;
    } & Document;
    compression: {
        'compressed pages read': number;
        'compressed pages written': number;
        'page written failed to compress': number;
        'page written was too small to compress': number;
        'raw compression call failed, additional data available': number;
        'raw compression call failed, no additional data available': number;
        'raw compression call succeeded': number;
    } & Document;
    cursor: {
        'bulk-loaded cursor-insert calls': number;
        'create calls': number;
        'cursor-insert key and value bytes inserted': number;
        'cursor-remove key bytes removed': number;
        'cursor-update value bytes updated': number;
        'insert calls': number;
        'next calls': number;
        'prev calls': number;
        'remove calls': number;
        'reset calls': number;
        'restarted searches': number;
        'search calls': number;
        'search near calls': number;
        'truncate calls': number;
        'update calls': number;
    };
    reconciliation: {
        'dictionary matches': number;
        'fast-path pages deleted': number;
        'internal page key bytes discarded using suffix compression': number;
        'internal page multi-block writes': number;
        'internal-page overflow keys': number;
        'leaf page key bytes discarded using prefix compression': number;
        'leaf page multi-block writes': number;
        'leaf-page overflow keys': number;
        'maximum blocks required for a page': number;
        'overflow values written': number;
        'page checksum matches': number;
        'page reconciliation calls': number;
        'page reconciliation calls for eviction': number;
        'pages deleted': number;
    } & Document;
}

/* Excluded from this release type: WithConnectionCallback */

/** Add an _id field to an object shaped type @public */
export declare type WithId<TSchema> = EnhancedOmit<TSchema, '_id'> & {
    _id: InferIdType<TSchema>;
};

/** Remove the _id field from an object shaped type @public */
export declare type WithoutId<TSchema> = Omit<TSchema, '_id'>;

/** @public */
export declare type WithSessionCallback = (session: ClientSession) => Promise<any>;

/** @public */
export declare type WithTransactionCallback<T = void> = (session: ClientSession) => Promise<T>;

/**
 * A MongoDB WriteConcern, which describes the level of acknowledgement
 * requested from MongoDB for write operations.
 * @public
 *
 * @see https://docs.mongodb.com/manual/reference/write-concern/
 */
export declare class WriteConcern {
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
    constructor(w?: W, wtimeout?: number, j?: boolean, fsync?: boolean | 1);
    /** Construct a WriteConcern given an options object. */
    static fromOptions(options?: WriteConcernOptions | WriteConcern | W, inherit?: WriteConcernOptions | WriteConcern): WriteConcern | undefined;
}

/**
 * An error representing a failure by the server to apply the requested write concern to the bulk operation.
 * @public
 * @category Error
 */
export declare class WriteConcernError {
    /* Excluded from this release type: [kServerError] */
    constructor(error: WriteConcernErrorData);
    /** Write concern error code. */
    get code(): number | undefined;
    /** Write concern error message. */
    get errmsg(): string | undefined;
    /** Write concern error info. */
    get errInfo(): Document | undefined;
    /** @deprecated The `err` prop that contained a MongoServerError has been deprecated. */
    get err(): WriteConcernErrorData;
    toJSON(): WriteConcernErrorData;
    toString(): string;
}

/** @public */
export declare interface WriteConcernErrorData {
    code: number;
    errmsg: string;
    errInfo?: Document;
}

/** @public */
export declare interface WriteConcernOptions {
    /** Write Concern as an object */
    writeConcern?: WriteConcern | WriteConcernSettings;
}

/** @public */
export declare interface WriteConcernSettings {
    /** The write concern */
    w?: W;
    /** The write concern timeout */
    wtimeoutMS?: number;
    /** The journal write concern */
    journal?: boolean;
    /** The journal write concern */
    j?: boolean;
    /** The write concern timeout */
    wtimeout?: number;
    /** The file sync write concern */
    fsync?: boolean | 1;
}

/**
 * An error that occurred during a BulkWrite on the server.
 * @public
 * @category Error
 */
export declare class WriteError {
    err: BulkWriteOperationError;
    constructor(err: BulkWriteOperationError);
    /** WriteError code. */
    get code(): number;
    /** WriteError original bulk operation index. */
    get index(): number;
    /** WriteError message. */
    get errmsg(): string | undefined;
    /** WriteError details. */
    get errInfo(): Document | undefined;
    /** Returns the underlying operation that caused the error */
    getOperation(): Document;
    toJSON(): {
        code: number;
        index: number;
        errmsg?: string;
        op: Document;
    };
    toString(): string;
}

/* Excluded from this release type: WriteProtocolMessageType */

export { }
