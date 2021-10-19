import { ReadPreference } from './read_preference';
import { MongoRuntimeError, MongoTransactionError } from './error';
import { ReadConcern, ReadConcernLike } from './read_concern';
import { WriteConcern } from './write_concern';
import type { Server } from './sdam/server';
import type { CommandOperationOptions } from './operations/command';
import type { Document } from './bson';

/** @internal */
export const TxnState = Object.freeze({
  NO_TRANSACTION: 'NO_TRANSACTION',
  STARTING_TRANSACTION: 'STARTING_TRANSACTION',
  TRANSACTION_IN_PROGRESS: 'TRANSACTION_IN_PROGRESS',
  TRANSACTION_COMMITTED: 'TRANSACTION_COMMITTED',
  TRANSACTION_COMMITTED_EMPTY: 'TRANSACTION_COMMITTED_EMPTY',
  TRANSACTION_ABORTED: 'TRANSACTION_ABORTED'
} as const);

/** @internal */
export type TxnState = typeof TxnState[keyof typeof TxnState];

const stateMachine: { [state in TxnState]: TxnState[] } = {
  [TxnState.NO_TRANSACTION]: [TxnState.NO_TRANSACTION, TxnState.STARTING_TRANSACTION],
  [TxnState.STARTING_TRANSACTION]: [
    TxnState.TRANSACTION_IN_PROGRESS,
    TxnState.TRANSACTION_COMMITTED,
    TxnState.TRANSACTION_COMMITTED_EMPTY,
    TxnState.TRANSACTION_ABORTED
  ],
  [TxnState.TRANSACTION_IN_PROGRESS]: [
    TxnState.TRANSACTION_IN_PROGRESS,
    TxnState.TRANSACTION_COMMITTED,
    TxnState.TRANSACTION_ABORTED
  ],
  [TxnState.TRANSACTION_COMMITTED]: [
    TxnState.TRANSACTION_COMMITTED,
    TxnState.TRANSACTION_COMMITTED_EMPTY,
    TxnState.STARTING_TRANSACTION,
    TxnState.NO_TRANSACTION
  ],
  [TxnState.TRANSACTION_ABORTED]: [TxnState.STARTING_TRANSACTION, TxnState.NO_TRANSACTION],
  [TxnState.TRANSACTION_COMMITTED_EMPTY]: [
    TxnState.TRANSACTION_COMMITTED_EMPTY,
    TxnState.NO_TRANSACTION
  ]
};

const ACTIVE_STATES: Set<TxnState> = new Set([
  TxnState.STARTING_TRANSACTION,
  TxnState.TRANSACTION_IN_PROGRESS
]);

const COMMITTED_STATES: Set<TxnState> = new Set([
  TxnState.TRANSACTION_COMMITTED,
  TxnState.TRANSACTION_COMMITTED_EMPTY,
  TxnState.TRANSACTION_ABORTED
]);

/**
 * Configuration options for a transaction.
 * @public
 */
export interface TransactionOptions extends CommandOperationOptions {
  // TODO(NODE-3344): These options use the proper class forms of these settings, it should accept the basic enum values too
  /** A default read concern for commands in this transaction */
  readConcern?: ReadConcernLike;
  /** A default writeConcern for commands in this transaction */
  writeConcern?: WriteConcern;
  /** A default read preference for commands in this transaction */
  readPreference?: ReadPreference;

  maxCommitTimeMS?: number;
}

/**
 * @public
 * A class maintaining state related to a server transaction. Internal Only
 */
export class Transaction {
  /** @internal */
  state: TxnState;
  options: TransactionOptions;
  /** @internal */
  _pinnedServer?: Server;
  /** @internal */
  _recoveryToken?: Document;

  /** Create a transaction @internal */
  constructor(options?: TransactionOptions) {
    options = options ?? {};
    this.state = TxnState.NO_TRANSACTION;
    this.options = {};

    const writeConcern = WriteConcern.fromOptions(options);
    if (writeConcern) {
      if (writeConcern.w === 0) {
        throw new MongoTransactionError('Transactions do not support unacknowledged write concern');
      }

      this.options.writeConcern = writeConcern;
    }

    if (options.readConcern) {
      this.options.readConcern = ReadConcern.fromOptions(options);
    }

    if (options.readPreference) {
      this.options.readPreference = ReadPreference.fromOptions(options);
    }

    if (options.maxCommitTimeMS) {
      this.options.maxTimeMS = options.maxCommitTimeMS;
    }

    // TODO: This isn't technically necessary
    this._pinnedServer = undefined;
    this._recoveryToken = undefined;
  }

  /** @internal */
  get server(): Server | undefined {
    return this._pinnedServer;
  }

  get recoveryToken(): Document | undefined {
    return this._recoveryToken;
  }

  get isPinned(): boolean {
    return !!this.server;
  }

  /** @returns Whether the transaction has started */
  get isStarting(): boolean {
    return this.state === TxnState.STARTING_TRANSACTION;
  }

  /**
   * @returns Whether this session is presently in a transaction
   */
  get isActive(): boolean {
    return ACTIVE_STATES.has(this.state);
  }

  get isCommitted(): boolean {
    return COMMITTED_STATES.has(this.state);
  }
  /**
   * Transition the transaction in the state machine
   * @internal
   * @param nextState - The new state to transition to
   */
  transition(nextState: TxnState): void {
    const nextStates = stateMachine[this.state];
    if (nextStates && nextStates.includes(nextState)) {
      this.state = nextState;
      if (
        this.state === TxnState.NO_TRANSACTION ||
        this.state === TxnState.STARTING_TRANSACTION ||
        this.state === TxnState.TRANSACTION_ABORTED
      ) {
        this.unpinServer();
      }
      return;
    }

    throw new MongoRuntimeError(
      `Attempted illegal state transition from [${this.state}] to [${nextState}]`
    );
  }

  /** @internal */
  pinServer(server: Server): void {
    if (this.isActive) {
      this._pinnedServer = server;
    }
  }

  /** @internal */
  unpinServer(): void {
    this._pinnedServer = undefined;
  }
}

export function isTransactionCommand(command: Document): boolean {
  return !!(command.commitTransaction || command.abortTransaction);
}
