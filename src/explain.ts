import type { Server } from './sdam/server';
import { maxWireVersion } from './utils';

export const SUPPORTS_EXPLAIN_WITH_REMOVE = 3;
export const SUPPORTS_EXPLAIN_WITH_UPDATE = 3;
export const SUPPORTS_EXPLAIN_WITH_DISTINCT = 3.2;
export const SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY = 3.2;
export const SUPPORTS_EXPLAIN_WITH_MAP_REDUCE = 4.4;

/** @public */
export interface ExplainOptions {
  explain?: VerbosityLike;
}

export enum Verbosity {
  queryPlanner = 'queryPlanner',
  queryPlannerExtended = 'queryPlannerExtended',
  executionStats = 'executionStats',
  allPlansExecution = 'allPlansExecution'
}

/** @public */
export type VerbosityLike = Verbosity | boolean;

export class Explain {
  explain: Verbosity;

  constructor(explain: VerbosityLike) {
    if (typeof explain === 'boolean') {
      // For backwards compatibility, true is interpreted as
      // "allPlansExecution" and false as "queryPlanner".
      this.explain = explain ? Verbosity.allPlansExecution : Verbosity.queryPlanner;
    } else {
      this.explain = Verbosity[explain];
    }
  }

  static fromOptions(options?: ExplainOptions): Explain | undefined {
    if (options == null || options.explain === undefined) {
      return;
    }
    return new Explain(options.explain);
  }

  /**
   * Checks that the server supports explain on the given operation.
   * @internal
   *
   * @param server - to check against
   * @param op - the operation to explain
   */
  static explainSupported(server: Server, op: string): boolean {
    const wireVersion = maxWireVersion(server);
    if (
      (op === 'remove' && wireVersion >= SUPPORTS_EXPLAIN_WITH_REMOVE) ||
      (op === 'update' && wireVersion >= SUPPORTS_EXPLAIN_WITH_UPDATE) ||
      (op === 'distinct' && wireVersion >= SUPPORTS_EXPLAIN_WITH_DISTINCT) ||
      (op === 'findAndModify' && wireVersion >= SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY) ||
      (op === 'mapReduce' && wireVersion >= SUPPORTS_EXPLAIN_WITH_MAP_REDUCE)
    ) {
      return true;
    }

    return false;
  }
}
