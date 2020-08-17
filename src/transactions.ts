import { ReadPreference } from './read_preference';
import { MongoError } from './error';
import { ReadConcern } from './read_concern';
import { WriteConcern } from './write_concern';
import type { Server } from './sdam/server';
import type { CommandOperationOptions } from './operations/command';
import type { Document } from './bson';

export enum TxnState {
  NO_TRANSACTION = 'NO_TRANSACTION',
  STARTING_TRANSACTION = 'STARTING_TRANSACTION',
  TRANSACTION_IN_PROGRESS = 'TRANSACTION_IN_PROGRESS',
  TRANSACTION_COMMITTED = 'TRANSACTION_COMMITTED',
  TRANSACTION_COMMITTED_EMPTY = 'TRANSACTION_COMMITTED_EMPTY',
  TRANSACTION_ABORTED = 'TRANSACTION_ABORTED'
}

const stateMachine = {
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

/** Configuration options for a transaction. */
export interface TransactionOptions extends CommandOperationOptions {
  /** @property {ReadConcern} [readConcern] A default read concern for commands in this transaction */
  readConcern?: ReadConcern;
  /** A default writeConcern for commands in this transaction */
  writeConcern?: WriteConcern;
  /** A default read preference for commands in this transaction */
  readPreference?: ReadPreference;

  maxCommitTimeMS?: number;
}

/**
 * A class maintaining state related to a server transaction. Internal Only
 */
export class Transaction {
  state: TxnState;
  options: TransactionOptions;
  _pinnedServer?: Server;
  _recoveryToken?: Document;

  /** Create a transaction */
  constructor(options?: TransactionOptions) {
    options = options || {};

    this.state = TxnState.NO_TRANSACTION;
    this.options = {};

    const writeConcern = WriteConcern.fromOptions(options);
    if (writeConcern) {
      if (writeConcern.w === 0) {
        throw new MongoError('Transactions do not support unacknowledged write concern');
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

  get server(): Server | undefined {
    return this._pinnedServer;
  }

  get recoveryToken(): Document | undefined {
    return this._recoveryToken;
  }

  get isPinned(): boolean {
    return !!this.server;
  }

  /**
   * @returns Whether this session is presently in a transaction
   */
  get isActive(): boolean {
    return (
      [TxnState.STARTING_TRANSACTION, TxnState.TRANSACTION_IN_PROGRESS].indexOf(this.state) !== -1
    );
  }

  /**
   * Transition the transaction in the state machine
   *
   * @param nextState The new state to transition to
   */
  transition(nextState: TxnState): void {
    const nextStates = stateMachine[this.state];
    if (nextStates && nextStates.indexOf(nextState) !== -1) {
      this.state = nextState;
      if (this.state === TxnState.NO_TRANSACTION || this.state === TxnState.STARTING_TRANSACTION) {
        this.unpinServer();
      }
      return;
    }

    throw new MongoError(
      `Attempted illegal state transition from [${this.state}] to [${nextState}]`
    );
  }

  pinServer(server: Server): void {
    if (this.isActive) {
      this._pinnedServer = server;
    }
  }

  unpinServer(): void {
    this._pinnedServer = undefined;
  }
}

export function isTransactionCommand(command: Document): boolean {
  return !!(command.commitTransaction || command.abortTransaction);
}
