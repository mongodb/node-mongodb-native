import type { Document } from '.';
import { MongoError } from './error';
import type { Server } from './sdam/server';
import { maxWireVersion } from './utils';

/** @public */
export const ExplainVerbosity = {
  queryPlanner: 'queryPlanner',
  queryPlannerExtended: 'queryPlannerExtended',
  executionStats: 'executionStats',
  allPlansExecution: 'allPlansExecution'
} as const;

/**
 * For backwards compatibility, true is interpreted as
 * "allPlansExecution" and false as "queryPlanner".
 * @public
 */
export type ExplainVerbosityLike = keyof typeof ExplainVerbosity | boolean;

/** @public */
export interface ExplainOptions {
  /** Specifies the verbosity mode for the explain output. */
  explain?: ExplainVerbosityLike;
}

// Minimum server versions which support explain with specific operations
const SUPPORTS_EXPLAIN_WITH_REMOVE = 3;
const SUPPORTS_EXPLAIN_WITH_UPDATE = 3;
const SUPPORTS_EXPLAIN_WITH_DISTINCT = 4;
const SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY = 4;
const SUPPORTS_EXPLAIN_WITH_MAP_REDUCE = 9;

/** @internal */
export class Explain {
  verbosity: keyof typeof ExplainVerbosity;

  constructor(verbosity: ExplainVerbosityLike) {
    if (typeof verbosity === 'boolean') {
      this.verbosity = verbosity
        ? ExplainVerbosity.allPlansExecution
        : ExplainVerbosity.queryPlanner;
    } else {
      this.verbosity = ExplainVerbosity[verbosity];
    }
  }

  static fromOptions(options?: ExplainOptions): Explain | undefined {
    if (options?.explain === undefined) return;

    const explain = options.explain;
    if (typeof explain === 'boolean' || explain in ExplainVerbosity) {
      return new Explain(explain);
    }

    throw new MongoError(`explain must be one of ${Object.keys(ExplainVerbosity)} or a boolean`);
  }

  /** Checks that the server supports explain on the given operation or command.*/
  static explainSupported(server: Server, op: string | Document): boolean {
    const wireVersion = maxWireVersion(server);
    if (op === 'remove' || (typeof op === 'object' && op.remove)) {
      return wireVersion >= SUPPORTS_EXPLAIN_WITH_REMOVE;
    } else if (op === 'update' || (typeof op === 'object' && op.update)) {
      return wireVersion >= SUPPORTS_EXPLAIN_WITH_UPDATE;
    } else if (op === 'distinct' || (typeof op === 'object' && op.distinct)) {
      return wireVersion >= SUPPORTS_EXPLAIN_WITH_DISTINCT;
    } else if (op === 'findAndModify' || (typeof op === 'object' && op.findAndModify)) {
      return wireVersion >= SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY;
    } else if (op === 'mapReduce' || (typeof op === 'object' && op.mapReduce)) {
      return wireVersion >= SUPPORTS_EXPLAIN_WITH_MAP_REDUCE;
    }

    return false;
  }
}
