import { type Document } from '../../bson';
import { DocumentSequence } from '../../cmap/commands';
import type { Filter, OptionalId, UpdateFilter, WithoutId } from '../../mongo_types';
import { type CollationOptions } from '../command';
import { type Hint } from '../operation';
import type {
  AnyClientBulkWriteModel,
  ClientBulkWriteOptions,
  ClientDeleteManyModel,
  ClientDeleteOneModel,
  ClientInsertOneModel,
  ClientReplaceOneModel,
  ClientUpdateManyModel,
  ClientUpdateOneModel
} from './common';

/** @internal */
export interface ClientBulkWriteCommand {
  bulkWrite: 1;
  errorsOnly: boolean;
  ordered: boolean;
  ops: DocumentSequence;
  nsInfo: DocumentSequence;
  bypassDocumentValidation?: boolean;
  let?: Document;
}

/** @internal */
export class ClientBulkWriteCommandBuilder {
  models: AnyClientBulkWriteModel[];
  options: ClientBulkWriteOptions;

  /**
   * Create the command builder.
   * @param models - The client write models.
   */
  constructor(models: AnyClientBulkWriteModel[], options: ClientBulkWriteOptions) {
    this.models = models;
    this.options = options;
  }

  /**
   * Gets the errorsOnly value for the command, which is the inverse of the
   * user provided verboseResults option. Defaults to true.
   */
  get errorsOnly(): boolean {
    if ('verboseResults' in this.options) {
      return !this.options.verboseResults;
    }
    return true;
  }

  /**
   * Build the bulk write commands from the models.
   */
  buildCommands(): ClientBulkWriteCommand[] {
    // Iterate the models to build the ops and nsInfo fields.
    const operations = [];
    let currentNamespaceIndex = 0;
    const namespaces = new Map<string, number>();
    for (const model of this.models) {
      const ns = model.namespace;
      if (namespaces.has(ns)) {
        operations.push(buildOperation(model, namespaces.get(ns) as number));
      } else {
        namespaces.set(ns, currentNamespaceIndex);
        operations.push(buildOperation(model, currentNamespaceIndex));
        currentNamespaceIndex++;
      }
    }

    const nsInfo = Array.from(namespaces.keys(), ns => ({ ns }));

    // The base command.
    const command: ClientBulkWriteCommand = {
      bulkWrite: 1,
      errorsOnly: this.errorsOnly,
      ordered: this.options.ordered ?? true,
      ops: new DocumentSequence(operations),
      nsInfo: new DocumentSequence(nsInfo)
    };
    // Add bypassDocumentValidation if it was present in the options.
    if ('bypassDocumentValidation' in this.options) {
      command.bypassDocumentValidation = this.options.bypassDocumentValidation;
    }
    // Add let if it was present in the options.
    if (this.options.let) {
      command.let = this.options.let;
    }
    return [command];
  }
}

/** @internal */
export interface InsertOperation<TSchema extends Document = Document> {
  insert: number;
  document: OptionalId<TSchema>;
}

/**
 * Build the insert one operation.
 * @param model - The insert one model.
 * @param index - The namespace index.
 * @returns the operation.
 */
export const buildInsertOneOperation = (model: ClientInsertOneModel, index: number): Document => {
  const document: InsertOperation = {
    insert: index,
    document: model.document
  };
  return document;
};

/** @internal */
export interface DeleteOperation<TSchema extends Document = Document> {
  delete: number;
  multi: boolean;
  filter: Filter<TSchema>;
  hint?: Hint;
  collation?: CollationOptions;
}

/**
 * Build the delete one operation.
 * @param model - The insert many model.
 * @param index - The namespace index.
 * @returns the operation.
 */
export const buildDeleteOneOperation = (model: ClientDeleteOneModel, index: number): Document => {
  return createDeleteOperation(model, index, false);
};

/**
 * Build the delete many operation.
 * @param model - The delete many model.
 * @param index - The namespace index.
 * @returns the operation.
 */
export const buildDeleteManyOperation = (model: ClientDeleteManyModel, index: number): Document => {
  return createDeleteOperation(model, index, true);
};

/**
 * Creates a delete operation based on the parameters.
 */
function createDeleteOperation(
  model: ClientDeleteOneModel | ClientDeleteManyModel,
  index: number,
  multi: boolean
): DeleteOperation {
  const document: DeleteOperation = {
    delete: index,
    multi: multi,
    filter: model.filter
  };
  if (model.hint) {
    document.hint = model.hint;
  }
  if (model.collation) {
    document.collation = model.collation;
  }
  return document;
}

/** @internal */
export interface UpdateOperation<TSchema extends Document = Document> {
  update: number;
  multi: boolean;
  filter: Filter<TSchema>;
  updateMods: UpdateFilter<TSchema> | Document[];
  hint?: Hint;
  upsert?: boolean;
  arrayFilters?: Document[];
}

/**
 * Build the update one operation.
 * @param model - The update one model.
 * @param index - The namespace index.
 * @returns the operation.
 */
export const buildUpdateOneOperation = (
  model: ClientUpdateOneModel,
  index: number
): UpdateOperation => {
  return createUpdateOperation(model, index, false);
};

/**
 * Build the update many operation.
 * @param model - The update many model.
 * @param index - The namespace index.
 * @returns the operation.
 */
export const buildUpdateManyOperation = (
  model: ClientUpdateManyModel,
  index: number
): UpdateOperation => {
  return createUpdateOperation(model, index, true);
};

/**
 * Creates a delete operation based on the parameters.
 */
function createUpdateOperation(
  model: ClientUpdateOneModel | ClientUpdateManyModel,
  index: number,
  multi: boolean
): UpdateOperation {
  const document: UpdateOperation = {
    update: index,
    multi: multi,
    filter: model.filter,
    updateMods: model.update
  };
  if (model.hint) {
    document.hint = model.hint;
  }
  if (model.upsert) {
    document.upsert = model.upsert;
  }
  if (model.arrayFilters) {
    document.arrayFilters = model.arrayFilters;
  }
  return document;
}

/** @internal */
export interface ReplaceOneOperation<TSchema extends Document = Document> {
  update: number;
  multi: boolean;
  filter: Filter<TSchema>;
  updateMods: WithoutId<TSchema>;
  hint?: Hint;
  upsert?: boolean;
}

/**
 * Build the replace one operation.
 * @param model - The replace one model.
 * @param index - The namespace index.
 * @returns the operation.
 */
export const buildReplaceOneOperation = (
  model: ClientReplaceOneModel,
  index: number
): ReplaceOneOperation => {
  const document: ReplaceOneOperation = {
    update: index,
    multi: false,
    filter: model.filter,
    updateMods: model.replacement
  };
  if (model.hint) {
    document.hint = model.hint;
  }
  if (model.upsert) {
    document.upsert = model.upsert;
  }
  return document;
};

/** @internal */
export function buildOperation(model: AnyClientBulkWriteModel, index: number): Document {
  switch (model.name) {
    case 'insertOne':
      return buildInsertOneOperation(model, index);
    case 'deleteOne':
      return buildDeleteOneOperation(model, index);
    case 'deleteMany':
      return buildDeleteManyOperation(model, index);
    case 'updateOne':
      return buildUpdateOneOperation(model, index);
    case 'updateMany':
      return buildUpdateManyOperation(model, index);
    case 'replaceOne':
      return buildReplaceOneOperation(model, index);
  }
}
