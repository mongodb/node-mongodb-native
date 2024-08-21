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
export interface ClientInsertOneModel<TSchema extends Document = Document>
  extends ClientWriteModel {
  name: 'insertOne';
  /** The document to insert. */
  document: OptionalId<TSchema>;
}

/** @public */
export interface ClientDeleteOneModel<TSchema extends Document = Document>
  extends ClientWriteModel {
  name: 'deleteOne';
  /** The filter to limit the deleted documents. */
  filter: Filter<TSchema>;
  /** Specifies a collation. */
  collation?: CollationOptions;
  /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
  hint?: Hint;
}

/** @public */
export interface ClientDeleteManyModel<TSchema extends Document = Document>
  extends ClientWriteModel {
  name: 'deleteMany';
  /** The filter to limit the deleted documents. */
  filter: Filter<TSchema>;
  /** Specifies a collation. */
  collation?: CollationOptions;
  /** The index to use. If specified, then the query system will only consider plans using the hinted index. */
  hint?: Hint;
}

/** @public */
export interface ClientReplaceOneModel<TSchema extends Document = Document>
  extends ClientWriteModel {
  name: 'replaceOne';
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
export interface ClientUpdateOneModel<TSchema extends Document = Document>
  extends ClientWriteModel {
  name: 'updateOne';
  /** The filter to limit the updated documents. */
  filter: Filter<TSchema>;
  /**
   * The modifications to apply. The value can be either:
   * UpdateFilter<TSchema> - A document that contains update operator expressions,
   * Document[] - an aggregation pipeline.
   */
  update: UpdateFilter<TSchema> | Document[];
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
export interface ClientUpdateManyModel<TSchema extends Document = Document>
  extends ClientWriteModel {
  name: 'updateMany';
  /** The filter to limit the updated documents. */
  filter: Filter<TSchema>;
  /**
   * The modifications to apply. The value can be either:
   * UpdateFilter<TSchema> - A document that contains update operator expressions,
   * Document[] - an aggregation pipeline.
   */
  update: UpdateFilter<TSchema> | Document[];
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
export type AnyClientBulkWriteModel<TSchema extends Document = Document> =
  | ClientInsertOneModel<TSchema>
  | ClientReplaceOneModel<TSchema>
  | ClientUpdateOneModel<TSchema>
  | ClientUpdateManyModel<TSchema>
  | ClientDeleteOneModel<TSchema>
  | ClientDeleteManyModel<TSchema>;
