import { type Document } from '../../bson';
import { DocumentSequence } from '../../cmap/commands';
import { MongoInvalidArgumentError } from '../../error';
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
  buildCommands(): Document[] {
    // The base command.
    const command: Document = {
      bulkWrite: 1,
      errorsOnly: this.errorsOnly,
      ordered: this.options.ordered ?? true
    };
    // Add bypassDocumentValidation if it was present in the options.
    if ('bypassDocumentValidation' in this.options) {
      command.bypassDocumentValidation = this.options.bypassDocumentValidation;
    }
    // Add let if it was present in the options.
    if ('let' in this.options) {
      command.let = this.options.let;
    }

    // Iterate the models to build the ops and nsInfo fields.
    const operations = [];
    let currentNamespaceIndex = 0;
    const namespaces = new Map<string, number>();
    for (const model of this.models) {
      const ns = model.namespace;
      if (namespaces.has(ns)) {
        operations.push(builderFor(model).buildOperation(namespaces.get(ns) as number));
      } else {
        namespaces.set(ns, currentNamespaceIndex);
        operations.push(builderFor(model).buildOperation(currentNamespaceIndex));
        currentNamespaceIndex++;
      }
    }

    const nsInfo = Array.from(namespaces.keys()).map(ns => {
      return { ns: ns };
    });
    command.ops = new DocumentSequence(operations);
    command.nsInfo = new DocumentSequence(nsInfo);
    return [command];
  }
}

/** @internal */
export interface OperationBuilder {
  buildOperation(index: number): Document;
}

/**
 * Builds insert one operations given the model.
 * @internal
 */
export class InsertOneOperationBuilder implements OperationBuilder {
  model: ClientInsertOneModel;

  /**
   * Instantiate the builder.
   * @param model - The client insert one model.
   */
  constructor(model: ClientInsertOneModel) {
    this.model = model;
  }

  /**
   * Build the operation.
   * @param index - The namespace index.
   * @returns the operation.
   */
  buildOperation(index: number): Document {
    const document: Document = {
      insert: index,
      document: this.model.document
    };
    return document;
  }
}

/** @internal */
export class DeleteOneOperationBuilder implements OperationBuilder {
  model: ClientDeleteOneModel;

  /**
   * Instantiate the builder.
   * @param model - The client delete one model.
   */
  constructor(model: ClientDeleteOneModel) {
    this.model = model;
  }

  /**
   * Build the operation.
   * @param index - The namespace index.
   * @returns the operation.
   */
  buildOperation(index: number): Document {
    return createDeleteOperation(this.model, index, false);
  }
}

/** @internal */
export class DeleteManyOperationBuilder implements OperationBuilder {
  model: ClientDeleteManyModel;

  /**
   * Instantiate the builder.
   * @param model - The client delete many model.
   */
  constructor(model: ClientDeleteManyModel) {
    this.model = model;
  }

  /**
   * Build the operation.
   * @param index - The namespace index.
   * @returns the operation.
   */
  buildOperation(index: number): Document {
    return createDeleteOperation(this.model, index, true);
  }
}

/**
 * Creates a delete operation based on the parameters.
 */
function createDeleteOperation(
  model: ClientDeleteOneModel | ClientDeleteManyModel,
  index: number,
  multi: boolean
): Document {
  const document: Document = {
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
export class UpdateOneOperationBuilder implements OperationBuilder {
  model: ClientUpdateOneModel;

  /**
   * Instantiate the builder.
   * @param model - The client update one model.
   */
  constructor(model: ClientUpdateOneModel) {
    this.model = model;
  }

  /**
   * Build the operation.
   * @param index - The namespace index.
   * @returns the operation.
   */
  buildOperation(index: number): Document {
    return createUpdateOperation(this.model, index, false);
  }
}

/** @internal */
export class UpdateManyOperationBuilder implements OperationBuilder {
  model: ClientUpdateManyModel;

  /**
   * Instantiate the builder.
   * @param model - The client update many model.
   */
  constructor(model: ClientUpdateManyModel) {
    this.model = model;
  }

  /**
   * Build the operation.
   * @param index - The namespace index.
   * @returns the operation.
   */
  buildOperation(index: number): Document {
    return createUpdateOperation(this.model, index, true);
  }
}

/**
 * Creates a delete operation based on the parameters.
 */
function createUpdateOperation(
  model: ClientUpdateOneModel | ClientUpdateManyModel,
  index: number,
  multi: boolean
): Document {
  const document: Document = {
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
export class ReplaceOneOperationBuilder implements OperationBuilder {
  model: ClientReplaceOneModel;

  /**
   * Instantiate the builder.
   * @param model - The client replace one model.
   */
  constructor(model: ClientReplaceOneModel) {
    this.model = model;
  }

  /**
   * Build the operation.
   * @param index - The namespace index.
   * @returns the operation.
   */
  buildOperation(index: number): Document {
    const document: Document = {
      update: index,
      multi: false,
      filter: this.model.filter,
      updateMods: this.model.replacement
    };
    if (this.model.hint) {
      document.hint = this.model.hint;
    }
    if (this.model.upsert) {
      document.upsert = this.model.upsert;
    }
    return document;
  }
}

const BUILDERS: Map<string, (model: AnyClientBulkWriteModel) => OperationBuilder> = new Map();
BUILDERS.set('insertOne', model => new InsertOneOperationBuilder(model as ClientInsertOneModel));
BUILDERS.set('deleteMany', model => new DeleteManyOperationBuilder(model as ClientDeleteManyModel));
BUILDERS.set('deleteOne', model => new DeleteOneOperationBuilder(model as ClientDeleteOneModel));
BUILDERS.set('updateMany', model => new UpdateManyOperationBuilder(model as ClientUpdateManyModel));
BUILDERS.set('updateOne', model => new UpdateOneOperationBuilder(model as ClientUpdateOneModel));
BUILDERS.set('replaceOne', model => new ReplaceOneOperationBuilder(model as ClientReplaceOneModel));

/** @internal */
export function builderFor(model: AnyClientBulkWriteModel): OperationBuilder {
  const builder = BUILDERS.get(model.name)?.(model);
  if (!builder) {
    throw new MongoInvalidArgumentError(`Could not load builder for model ${model.name}`);
  }
  return builder;
}
