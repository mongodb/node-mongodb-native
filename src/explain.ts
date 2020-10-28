import type { Server } from './sdam/server';
import { maxWireVersion } from './utils';

enum VerbosityStrings {
  queryPlanner = 'queryPlanner',
  queryPlannerExtended = 'queryPlannerExtended',
  executionStats = 'executionStats',
  allPlansExecution = 'allPlansExecution'
}

export type Verbosity = boolean | VerbosityStrings;

/** @public */
export interface ExplainOptions {
  // The requested verbosity of the explain.
  explain?: Verbosity;
}

export const SUPPORTS_EXPLAIN_WITH_REMOVE = 3;
export const SUPPORTS_EXPLAIN_WITH_UPDATE = 3;
export const SUPPORTS_EXPLAIN_WITH_DISTINCT = 3.2;
export const SUPPORTS_EXPLAIN_WITH_FIND_AND_MODIFY = 3.2;
export const SUPPORTS_EXPLAIN_WITH_MAP_REDUCE = 4.4;

/**
 * Checks that the server supports explain on the given operation.
 * @internal
 *
 * @param server - to check against
 * @param op - the operation to explain
 */
export function explainSupported(server: Server, op: string): boolean {
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

/**
 * Checks that the provided verbosity level is valid.
 * @internal
 */
export function validExplainVerbosity(verbosity: boolean | string): boolean {
  if (typeof verbosity === 'string') {
    return verbosity in VerbosityStrings;
  }
  return true;
}
