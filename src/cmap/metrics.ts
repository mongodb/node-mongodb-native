/** @internal */
export class ConnectionPoolMetrics {
  static readonly TXN = 'txn' as const;
  static readonly CURSOR = 'cursor' as const;
  static readonly OTHER = 'other' as const;

  txnConnections!: number;
  cursorConnections!: number;
  otherConnections!: number;

  /**
   * Create the metrics object.
   */
  constructor() {
    this.reset();
  }

  /**
   * Mark a connection as pinned for a specific operation.
   */
  markPinned(pinType: string): void {
    if (pinType === ConnectionPoolMetrics.TXN) {
      this.txnConnections += 1;
    } else if (pinType === ConnectionPoolMetrics.CURSOR) {
      this.cursorConnections += 1;
    } else {
      this.otherConnections += 1;
    }
  }

  /**
   * Unmark a connection as pinned for an operation.
   */
  markUnpinned(pinType: string): void {
    if (pinType === ConnectionPoolMetrics.TXN) {
      this.txnConnections -= 1;
    } else if (pinType === ConnectionPoolMetrics.CURSOR) {
      this.cursorConnections -= 1;
    } else {
      this.otherConnections -= 1;
    }
  }

  /**
   * Return information about the cmap metrics as a string.
   */
  info(): string {
    return (
      'Timed out while checking out a connection from connection pool: ' +
      `connections in use by cursors: ${this.cursorConnections}, ` +
      `connections in use by transactions: ${this.txnConnections}, ` +
      `connections in use by other operations: ${this.otherConnections}`
    );
  }

  /**
   * Reset the metrics to the initial values.
   */
  reset(): void {
    this.txnConnections = 0;
    this.cursorConnections = 0;
    this.otherConnections = 0;
  }
}
