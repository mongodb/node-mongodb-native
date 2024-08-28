import { type Document } from '../../bson';
import type { Filter, OptionalId, UpdateFilter, WithoutId } from '../../mongo_types';
import type { CollationOptions, CommandOperationOptions } from '../../operations/command';
import type { Hint } from '../../operations/operation';

/** @public */
export interface ClientBulkWriteOptions extends CommandOperationOptions {
  /**
   * If true, when an insert fails, don't execute the remaining writes.
   * If false, continue with remaining inserts when one fails.
   * @defaultValue `true` - inserts are ordered by default
   */
  ordered?: boolean;
  /**
   * Allow driver to bypass schema validation.
   * @defaultValue `false` - documents will be validated by default
   **/
  bypassDocumentValidation?: boolean;
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;
  /**
   * Whether detailed results for each successful operation should be included in the returned
   * BulkWriteResult.
   */
  verboseResults?: boolean;
}

/** @public */
export interface ClientWriteModel {
  /** The namespace for the write. */
  namespace: string;
}

/** @public */
export interface ClientInsertOneModel extends ClientWriteModel {
  name: 'insertOne';
  /** The document to insert. */
  document: OptionalId<Document>;
}

/** @public */
export interface ClientDeleteOneModel extends ClientWriteModel {
  name: 'deleteOne';
  /**
   * The filter used to determine if a document should be deleted.
   * For a deleteOne operation, the first match is removed.
   */
  filter: Filter<Document>;
  /** Specifies a collation. */
  collation?: CollationOptions;
  /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
  hint?: Hint;
}

/** @public */
export interface ClientDeleteManyModel extends ClientWriteModel {
  name: 'deleteMany';
  /**
   * The filter used to determine if a document should be deleted.
   * For a deleteMany operation, all matches are removed.
   */
  filter: Filter<Document>;
  /** Specifies a collation. */
  collation?: CollationOptions;
  /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
  hint?: Hint;
}

/** @public */
export interface ClientReplaceOneModel extends ClientWriteModel {
  name: 'replaceOne';
  /**
   * The filter used to determine if a document should be replaced.
   * For a replaceOne operation, the first match is replaced.
   */
  filter: Filter<Document>;
  /** The document with which to replace the matched document. */
  replacement: WithoutId<Document>;
  /** Specifies a collation. */
  collation?: CollationOptions;
  /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
  hint?: Hint;
  /** When true, creates a new document if no document matches the query. */
  upsert?: boolean;
}

/** @public */
export interface ClientUpdateOneModel extends ClientWriteModel {
  name: 'updateOne';
  /**
   * The filter used to determine if a document should be updated.
   * For an updateOne operation, the first match is updated.
   */
  filter: Filter<Document>;
  /**
   * The modifications to apply. The value can be either:
   * UpdateFilter<Document> - A document that contains update operator expressions,
   * Document[] - an aggregation pipeline.
   */
  update: UpdateFilter<Document> | Document[];
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
export interface ClientUpdateManyModel extends ClientWriteModel {
  name: 'updateMany';
  /**
   * The filter used to determine if a document should be updated.
   * For an updateMany operation, all matches are updated.
   */
  filter: Filter<Document>;
  /**
   * The modifications to apply. The value can be either:
   * UpdateFilter<Document> - A document that contains update operator expressions,
   * Document[] - an aggregation pipeline.
   */
  update: UpdateFilter<Document> | Document[];
  /** A set of filters specifying to which array elements an update should apply. */
  arrayFilters?: Document[];
  /** Specifies a collation. */
  collation?: CollationOptions;
  /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
  hint?: Hint;
  /** When true, creates a new document if no document matches the query. */
  upsert?: boolean;
}

/**
 * Used to represent any of the client bulk write models that can be passed as an array
 * to MongoClient#bulkWrite.
 * @public
 */
export type AnyClientBulkWriteModel =
  | ClientInsertOneModel
  | ClientReplaceOneModel
  | ClientUpdateOneModel
  | ClientUpdateManyModel
  | ClientDeleteOneModel
  | ClientDeleteManyModel;
