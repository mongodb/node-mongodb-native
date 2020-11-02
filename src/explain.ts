import type { Document } from '.';
import type { ExplainOptions } from './operations/explainable_command';
import type { Server } from './sdam/server';
import { maxWireVersion } from './utils';

const SUPPORTS_EXPLAIN_WITH_REMOVE = 3;
const SUPPORTS_EXPLAIN_WITH_UPDATE = 3;
const SUPPORTS_EXPLAIN_WITH_DISTINCT = 3.2;
const SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY = 3.2;
const SUPPORTS_EXPLAIN_WITH_MAP_REDUCE = 4.4;

/** @public */
export enum Verbosity {
  queryPlanner = 'queryPlanner',
  queryPlannerExtended = 'queryPlannerExtended',
  executionStats = 'executionStats',
  allPlansExecution = 'allPlansExecution'
}

/** @public */
export type VerbosityLike = Verbosity | boolean;

/** @internal */
export class Explain {
  verbosity: Verbosity;

  constructor(verbosity: VerbosityLike) {
    if (typeof verbosity === 'boolean') {
      // For backwards compatibility, true is interpreted as
      // "allPlansExecution" and false as "queryPlanner".
      this.verbosity = verbosity ? Verbosity.allPlansExecution : Verbosity.queryPlanner;
    } else {
      this.verbosity = Verbosity[verbosity];
    }
  }

  static fromOptions(options?: ExplainOptions): Explain | undefined {
    if (options == null || options.explain === undefined) {
      return;
    }
    return new Explain(options.explain);
  }

  static valid(options?: ExplainOptions): boolean {
    if (options == null || options.explain === undefined) {
      return true;
    }
    const explain = options.explain;
    return typeof explain === 'boolean' || explain in Verbosity;
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
    return (
      (op === 'remove' && wireVersion >= SUPPORTS_EXPLAIN_WITH_REMOVE) ||
      (op === 'update' && wireVersion >= SUPPORTS_EXPLAIN_WITH_UPDATE) ||
      (op === 'distinct' && wireVersion >= SUPPORTS_EXPLAIN_WITH_DISTINCT) ||
      (op === 'findAndModify' && wireVersion >= SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY) ||
      (op === 'mapReduce' && wireVersion >= SUPPORTS_EXPLAIN_WITH_MAP_REDUCE)
    );
  }

  static explainSupportedOnCmd(server: Server, cmd: Document): boolean {
    const wireVersion = maxWireVersion(server);
    return (
      (cmd.remove && wireVersion >= SUPPORTS_EXPLAIN_WITH_REMOVE) ||
      (cmd.update && wireVersion >= SUPPORTS_EXPLAIN_WITH_UPDATE) ||
      (cmd.distinct && wireVersion >= SUPPORTS_EXPLAIN_WITH_DISTINCT) ||
      (cmd.findAndModify && wireVersion >= SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY) ||
      (cmd.mapReduce && wireVersion >= SUPPORTS_EXPLAIN_WITH_MAP_REDUCE)
    );
  }
}
