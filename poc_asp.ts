/**
 * POC: Atlas Stream Processing — create / start / stop / drop a stream processor.
 *
 * Run with:
 *   npx ts-node --skipProject poc_asp.ts
 *
 * Pipeline used:
 *   $source  → sample_stream_solar
 *   $emit    → __testLog
 */

import { MongoServerError } from './src/error';
import { StreamProcessingClient } from './src/stream_processing/stream_processing_client';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WORKSPACE_URI =
  'mongodb://atlas-stream-69ed590869155100cecc8b33-lulzki.virginia-usa.a.query.mongodb-dev.net/';
const USERNAME = 'streams';
const PASSWORD = 'letsdostreaming123';

const PROCESSOR_NAME = 'simpletestSP_node';

const PIPELINE = [
  {
    $source: {
      connectionName: 'sample_stream_solar'
    }
  },
  {
    $emit: {
      connectionName: '__testLog'
    }
  }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// POC steps
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new StreamProcessingClient(WORKSPACE_URI, {
    auth: { username: USERNAME, password: PASSWORD }
  });

  try {
    const sps = client.streamProcessors();

    // ------------------------------------------------------------------
    // 1. Create
    // ------------------------------------------------------------------
    console.log(`\n[1] Creating processor '${PROCESSOR_NAME}' ...`);
    try {
      await sps.create(PROCESSOR_NAME, PIPELINE);
      console.log('    Created OK');
    } catch (e) {
      if (e instanceof MongoServerError) {
        throw new Error(`    Create failed (code ${e.code}): ${e.message}`);
      }
      throw e;
    }

    // ------------------------------------------------------------------
    // 2. Inspect before starting
    // ------------------------------------------------------------------
    console.log('\n[2] Getting info ...');
    let info = await sps.getInfo(PROCESSOR_NAME);
    console.log(`    state            : ${info.state}`);
    console.log(`    pipelineVersion  : ${info.pipelineVersion}`);
    console.log(`    hasStarted       : ${info.hasStarted}`);

    // ------------------------------------------------------------------
    // 3. Start
    // ------------------------------------------------------------------
    const proc = sps.get(PROCESSOR_NAME);
    console.log('\n[3] Starting processor ...');
    try {
      await proc.start();
      console.log('    Start command sent OK');
    } catch (e) {
      if (e instanceof MongoServerError) {
        throw new Error(`    Start failed (code ${e.code}): ${e.message}`);
      }
      throw e;
    }

    await sleep(2000);

    info = await sps.getInfo(PROCESSOR_NAME);
    console.log(`    state after start: ${info.state}`);

    // ------------------------------------------------------------------
    // 4. Stats
    // ------------------------------------------------------------------
    console.log('\n[4] Fetching stats ...');
    try {
      const rawStats = await proc.stats();
      console.dir(rawStats, { depth: null });
    } catch (e) {
      if (e instanceof MongoServerError) {
        console.log(`    Stats unavailable (code ${e.code}): ${e.message}`);
      } else {
        throw e;
      }
    }

    // ------------------------------------------------------------------
    // 5. Sample (up to 5 docs)
    // Note: breaking manually after N docs because the dev server does not
    // signal cursor exhaustion with cursorId=0 as the spec requires.
    // ------------------------------------------------------------------
    console.log('\n[5] Sampling up to 5 documents ...');
    try {
      let count = 0;
      for await (const doc of proc.sample()) {
        console.log(`    doc: ${JSON.stringify(doc)}`);
        count += 1;
        if (count >= 5) break;
      }
      console.log(`    Sampled ${count} document(s)`);
    } catch (e) {
      if (e instanceof MongoServerError) {
        console.log(`    Sample unavailable (code ${e.code}): ${e.message}`);
      } else {
        throw e;
      }
    }

    // ------------------------------------------------------------------
    // 6. Stop
    // ------------------------------------------------------------------
    console.log('\n[6] Stopping processor ...');
    try {
      await proc.stop();
      console.log('    Stop command sent OK');
    } catch (e) {
      if (e instanceof MongoServerError) {
        throw new Error(`    Stop failed (code ${e.code}): ${e.message}`);
      }
      throw e;
    }

    await sleep(1000);

    info = await sps.getInfo(PROCESSOR_NAME);
    console.log(`    state after stop : ${info.state}`);

    // ------------------------------------------------------------------
    // 7. Drop (permanent — comment out to keep the processor alive)
    // ------------------------------------------------------------------
    console.log('\n[7] Dropping processor ...');
    try {
      await proc.drop();
      console.log('    Dropped OK');
    } catch (e) {
      if (e instanceof MongoServerError) {
        throw new Error(`    Drop failed (code ${e.code}): ${e.message}`);
      }
      throw e;
    }

    console.log('\nDone.');
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
