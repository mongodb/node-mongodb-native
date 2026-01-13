import { writeFile } from 'node:fs/promises';

import * as path from 'path';
import * as process from 'process';

import type { EntitiesMap } from './entities';
import { trace } from './runner';

/**
 * Writes the entities saved from the loop operations run in the
 * Astrolabe workload executor to the required files.
 */
export class AstrolabeResultsWriter {
  constructor(private entities: EntitiesMap) {
    this.entities = entities;
  }

  async write(): Promise<void> {
    // Write the events.json to the execution directory.
    const errors = this.entities.getEntity('errors', 'errors', false);
    const failures = this.entities.getEntity('failures', 'failures', false);
    const events = this.entities.getEntity('events', 'events', false);
    const iterations = this.entities.getEntity('iterations', 'iterations', false);
    const successes = this.entities.getEntity('successes', 'successes', false);

    // Write the events.json to the execution directory.
    trace('writing events.json');
    await writeFile(
      path.join(process.env.OUTPUT_DIRECTORY ?? '', 'events.json'),
      JSON.stringify({ events: events ?? [], errors: errors ?? [], failures: failures ?? [] })
    );

    // Write the results.json to the execution directory.
    trace('writing results.json');
    await writeFile(
      path.join(process.env.OUTPUT_DIRECTORY ?? '', 'results.json'),
      JSON.stringify({
        numErrors: errors?.length ?? 0,
        numFailures: failures?.length ?? 0,
        numSuccesses: successes ?? 0,
        numIterations: iterations ?? 0
      })
    );
  }
}
