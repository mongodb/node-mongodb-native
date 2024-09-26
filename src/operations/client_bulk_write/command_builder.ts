import { BSON, type Document } from '../../bson';
import { DocumentSequence } from '../../cmap/commands';
import { type PkFactory } from '../../mongo_client';
import type { Filter, OptionalId, UpdateFilter, WithoutId } from '../../mongo_types';
import { DEFAULT_PK_FACTORY } from '../../utils';
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
  comment?: any;
}

/**
 * The bytes overhead for the extra fields added post command generation.
 */
const MESSAGE_OVERHEAD_BYTES = 1000;

/** @internal */
export class ClientBulkWriteCommandBuilder {
  models: AnyClientBulkWriteModel[];
  options: ClientBulkWriteOptions;
  pkFactory: PkFactory;

  /**
   * Create the command builder.
   * @param models - The client write models.
   */
  constructor(
    models: AnyClientBulkWriteModel[],
    options: ClientBulkWriteOptions,
    pkFactory?: PkFactory
  ) {
    this.models = models;
    this.options = options;
    this.pkFactory = pkFactory ?? DEFAULT_PK_FACTORY;
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
  buildCommands(maxMessageSizeBytes: number, maxWriteBatchSize: number): ClientBulkWriteCommand[] {
    // Iterate the models to build the ops and nsInfo fields.
    // We need to do this in a loop which creates one command each up
    // to the max bson size or max message size.
    const commands: ClientBulkWriteCommand[] = [];
    let currentCommandLength = 0;
    let currentNamespaceIndex = 0;
    let currentCommand: ClientBulkWriteCommand = this.baseCommand();
    const namespaces = new Map<string, number>();

    for (const model of this.models) {
      const ns = model.namespace;
      const index = namespaces.get(ns);

      /**
       * Convenience function for resetting everything when a new batch
       * is started.
       */
      const reset = () => {
        commands.push(currentCommand);
        namespaces.clear();
        currentNamespaceIndex = 0;
        currentCommand = this.baseCommand();
        namespaces.set(ns, currentNamespaceIndex);
      };

      if (index != null) {
        // Pushing to the ops document sequence returns the bytes length added.
        const operation = buildOperation(model, index, this.pkFactory);
        const operationBuffer = BSON.serialize(operation);

        // Check if the operation buffer can fit in the current command. If it can,
        // then add the operation to the document sequence and increment the
        // current length as long as the ops don't exceed the maxWriteBatchSize.
        if (
          currentCommandLength + operationBuffer.length < maxMessageSizeBytes &&
          currentCommand.ops.documents.length < maxWriteBatchSize
        ) {
          // Pushing to the ops document sequence returns the total byte length of the document sequence.
          currentCommandLength =
            MESSAGE_OVERHEAD_BYTES + this.addOperation(currentCommand, operation, operationBuffer);
        } else {
          // We need to batch. Push the current command to the commands
          // array and create a new current command. We aslo need to clear the namespaces
          // map for the new command.
          reset();

          const nsInfo = { ns: ns };
          const nsInfoBuffer = BSON.serialize(nsInfo);
          currentCommandLength =
            MESSAGE_OVERHEAD_BYTES +
            this.addOperationAndNsInfo(
              currentCommand,
              operation,
              operationBuffer,
              nsInfo,
              nsInfoBuffer
            );
        }
      } else {
        namespaces.set(ns, currentNamespaceIndex);
        const nsInfo = { ns: ns };
        const nsInfoBuffer = BSON.serialize(nsInfo);
        const operation = buildOperation(model, currentNamespaceIndex, this.pkFactory);
        const operationBuffer = BSON.serialize(operation);

        // Check if the operation and nsInfo buffers can fit in the command. If they
        // can, then add the operation and nsInfo to their respective document
        // sequences and increment the current length as long as the ops don't exceed
        // the maxWriteBatchSize.
        if (
          currentCommandLength + nsInfoBuffer.length + operationBuffer.length <
            maxMessageSizeBytes &&
          currentCommand.ops.documents.length < maxWriteBatchSize
        ) {
          currentCommandLength =
            MESSAGE_OVERHEAD_BYTES +
            this.addOperationAndNsInfo(
              currentCommand,
              operation,
              operationBuffer,
              nsInfo,
              nsInfoBuffer
            );
        } else {
          // We need to batch. Push the current command to the commands
          // array and create a new current command. Aslo clear the namespaces map.
          reset();

          currentCommandLength =
            MESSAGE_OVERHEAD_BYTES +
            this.addOperationAndNsInfo(
              currentCommand,
              operation,
              operationBuffer,
              nsInfo,
              nsInfoBuffer
            );
        }
        // We've added a new namespace, increment the namespace index.
        currentNamespaceIndex++;
      }
    }

    // After we've finisihed iterating all the models put the last current command
    // only if there are operations in it.
    if (currentCommand.ops.documents.length > 0) {
      commands.push(currentCommand);
    }

    return commands;
  }

  private addOperation(
    command: ClientBulkWriteCommand,
    operation: Document,
    operationBuffer: Uint8Array
  ): number {
    // Pushing to the ops document sequence returns the total byte length of the document sequence.
    return command.ops.push(operation, operationBuffer);
  }

  private addOperationAndNsInfo(
    command: ClientBulkWriteCommand,
    operation: Document,
    operationBuffer: Uint8Array,
    nsInfo: Document,
    nsInfoBuffer: Uint8Array
  ): number {
    // Pushing to the nsInfo document sequence returns the total byte length of the document sequence.
    const nsInfoLength = command.nsInfo.push(nsInfo, nsInfoBuffer);
    const opsLength = this.addOperation(command, operation, operationBuffer);
    return nsInfoLength + opsLength;
  }

  private baseCommand(): ClientBulkWriteCommand {
    const command: ClientBulkWriteCommand = {
      bulkWrite: 1,
      errorsOnly: this.errorsOnly,
      ordered: this.options.ordered ?? true,
      ops: new DocumentSequence('ops'),
      nsInfo: new DocumentSequence('nsInfo')
    };
    // Add bypassDocumentValidation if it was present in the options.
    if (this.options.bypassDocumentValidation != null) {
      command.bypassDocumentValidation = this.options.bypassDocumentValidation;
    }
    // Add let if it was present in the options.
    if (this.options.let) {
      command.let = this.options.let;
    }

    // we check for undefined specifically here to allow falsy values
    // eslint-disable-next-line no-restricted-syntax
    if (this.options.comment !== undefined) {
      command.comment = this.options.comment;
    }

    return command;
  }
}

/** @internal */
interface ClientInsertOperation {
  insert: number;
  document: OptionalId<Document>;
}

/**
 * Build the insert one operation.
 * @param model - The insert one model.
 * @param index - The namespace index.
 * @returns the operation.
 */
export const buildInsertOneOperation = (
  model: ClientInsertOneModel,
  index: number,
  pkFactory: PkFactory
): ClientInsertOperation => {
  const document: ClientInsertOperation = {
    insert: index,
    document: model.document
  };
  document.document._id = model.document._id ?? pkFactory.createPk();
  return document;
};

/** @internal */
export interface ClientDeleteOperation {
  delete: number;
  multi: boolean;
  filter: Filter<Document>;
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
): ClientDeleteOperation {
  const document: ClientDeleteOperation = {
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
export interface ClientUpdateOperation {
  update: number;
  multi: boolean;
  filter: Filter<Document>;
  updateMods: UpdateFilter<Document> | Document[];
  hint?: Hint;
  upsert?: boolean;
  arrayFilters?: Document[];
  collation?: CollationOptions;
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
): ClientUpdateOperation => {
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
): ClientUpdateOperation => {
  return createUpdateOperation(model, index, true);
};

/**
 * Creates a delete operation based on the parameters.
 */
function createUpdateOperation(
  model: ClientUpdateOneModel | ClientUpdateManyModel,
  index: number,
  multi: boolean
): ClientUpdateOperation {
  const document: ClientUpdateOperation = {
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
  if (model.collation) {
    document.collation = model.collation;
  }
  return document;
}

/** @internal */
export interface ClientReplaceOneOperation {
  update: number;
  multi: boolean;
  filter: Filter<Document>;
  updateMods: WithoutId<Document>;
  hint?: Hint;
  upsert?: boolean;
  collation?: CollationOptions;
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
): ClientReplaceOneOperation => {
  const document: ClientReplaceOneOperation = {
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
  if (model.collation) {
    document.collation = model.collation;
  }
  return document;
};

/** @internal */
export function buildOperation(
  model: AnyClientBulkWriteModel,
  index: number,
  pkFactory: PkFactory
): Document {
  switch (model.name) {
    case 'insertOne':
      return buildInsertOneOperation(model, index, pkFactory);
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
