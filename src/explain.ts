import { MongoError } from './error';

/** @public */
export const ExplainVerbosity = {
  queryPlanner: 'queryPlanner',
  queryPlannerExtended: 'queryPlannerExtended',
  executionStats: 'executionStats',
  allPlansExecution: 'allPlansExecution'
} as const;

/**
 * For backwards compatibility, true is interpreted as "allPlansExecution"
 * and false as "queryPlanner". Prior to server version 3.6, aggregate()
 * ignores the verbosity parameter and executes in "queryPlanner".
 * @public
 */
export type ExplainVerbosityLike = keyof typeof ExplainVerbosity | boolean;

/** @public */
export interface ExplainOptions {
  /** Specifies the verbosity mode for the explain output. */
  explain?: ExplainVerbosityLike;
}

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
}
