import { MongoInvalidArgumentError } from './error';

/** @public */
export const ExplainVerbosity = Object.freeze({
  queryPlanner: 'queryPlanner',
  queryPlannerExtended: 'queryPlannerExtended',
  executionStats: 'executionStats',
  allPlansExecution: 'allPlansExecution'
} as const);

/** @public */
export type ExplainVerbosity = string;

/**
 * For backwards compatibility, true is interpreted as "allPlansExecution"
 * and false as "queryPlanner". Prior to server version 3.6, aggregate()
 * ignores the verbosity parameter and executes in "queryPlanner".
 * @public
 */
export type ExplainVerbosityLike = ExplainVerbosity | boolean;

/**
 * @public
 */
export interface ExplainCommandOptions {
  verbosity: ExplainVerbosityLike;
  maxTimeMS?: number;
}

/** @public */
export interface ExplainOptions {
  /** Specifies the verbosity mode for the explain output. */
  explain?: ExplainVerbosityLike | ExplainCommandOptions;
}

/** @internal */
export class Explain {
  verbosity: ExplainVerbosity;

  constructor(verbosity: ExplainVerbosityLike) {
    if (typeof verbosity === 'boolean') {
      this.verbosity = verbosity
        ? ExplainVerbosity.allPlansExecution
        : ExplainVerbosity.queryPlanner;
    } else {
      this.verbosity = verbosity;
    }
  }

  static fromOptions({ explain }: ExplainOptions = {}): Explain | undefined {
    if (explain == null) return;

    if (typeof explain === 'boolean' || typeof explain === 'string') {
      return new Explain(explain);
    }

    if (typeof explain === 'object') {
      const { verbosity } = explain;
      return new Explain(verbosity);
    }

    throw new MongoInvalidArgumentError(
      'Field "explain" must be a string, a boolean or an ExplainCommandOptions object.'
    );
  }
}

export class ExplainCommandOptions2 {
  private constructor(
    public readonly explain: Explain,
    public readonly maxTimeMS: number | undefined
  ) {}

  static fromOptions(options: ExplainOptions = {}): ExplainCommandOptions2 | undefined {
    const explain = Explain.fromOptions(options);
    const maxTimeMS = typeof options.explain === 'object' ? options.explain.maxTimeMS : undefined;

    return explain ? new ExplainCommandOptions2(explain, maxTimeMS) : undefined;
  }
}
