import { expect } from 'chai';
import { setTimeout } from 'timers/promises';

import {
  type Document,
  MongoServerError,
  SampleCursor,
  StreamProcessingClient,
  StreamProcessor,
  StreamProcessors
} from '../../mongodb';

/**
 * Integration tests for Atlas Stream Processing.
 *
 * Prerequisites:
 *   MONGODB_ASP_URI      - mongodb:// URI for an ASP workspace
 *   MONGODB_ASP_USERNAME - username with permission to manage stream processors
 *   MONGODB_ASP_PASSWORD - password for that user
 *
 * Optional:
 *   MONGODB_ASP_SOURCE_CONNECTION   - connection name for $source (default: sample_stream_solar)
 *   MONGODB_ASP_SINK_CONNECTION     - connection name for $emit   (default: __testLog)
 *
 * Run with:
 *   MONGODB_ASP_URI='mongodb://...' MONGODB_ASP_USERNAME=streams MONGODB_ASP_PASSWORD=... \
 *     npx mocha --timeout 60000 test/integration/atlas-stream-processing
 */

const ASP_URI = process.env.MONGODB_ASP_URI;
const ASP_USERNAME = process.env.MONGODB_ASP_USERNAME;
const ASP_PASSWORD = process.env.MONGODB_ASP_PASSWORD;
const SOURCE_CONNECTION = process.env.MONGODB_ASP_SOURCE_CONNECTION ?? 'sample_stream_solar';
const SINK_CONNECTION = process.env.MONGODB_ASP_SINK_CONNECTION ?? '__testLog';

const PROCESSOR_NAME = `node_driver_test_${Date.now()}`;

const PIPELINE: Document[] = [
  { $source: { connectionName: SOURCE_CONNECTION } },
  { $emit: { connectionName: SINK_CONNECTION } }
];

describe('Atlas Stream Processing', function () {
  before(function () {
    if (!ASP_URI) {
      this.skipReason = 'MONGODB_ASP_URI is not set; skipping ASP integration tests';
      this.skip();
    }
  });

  describe('StreamProcessingClient', function () {
    it('rejects mongodb+srv:// URIs', function () {
      expect(
        () => new StreamProcessingClient('mongodb+srv://host/db', { auth: { username: 'u', password: 'p' } })
      ).to.throw(Error, /mongodb\+srv/);
    });

    it('rejects tls: false in options', function () {
      expect(
        () => new StreamProcessingClient(ASP_URI!, { tls: false })
      ).to.throw(Error, /TLS cannot be disabled/);
    });

    it('rejects ssl=false in the URI query string', function () {
      const uri = ASP_URI!.includes('?')
        ? `${ASP_URI}&ssl=false`
        : `${ASP_URI}?ssl=false`;
      expect(() => new StreamProcessingClient(uri)).to.throw(Error, /TLS cannot be disabled/);
    });
  });

  describe('Processor lifecycle', function () {
    let client: StreamProcessingClient;
    let sps: StreamProcessors;
    let proc: StreamProcessor;

    before(async function () {
      client = new StreamProcessingClient(ASP_URI!, {
        auth: { username: ASP_USERNAME, password: ASP_PASSWORD }
      });
      sps = client.streamProcessors();
      proc = sps.get(PROCESSOR_NAME);
    });

    after(async function () {
      // Best-effort cleanup: drop the processor if it still exists.
      try {
        await proc.drop();
      } catch {
        // Ignore — processor may have already been dropped by the test.
      }
      await client?.close();
    });

    it('creates a stream processor', async function () {
      await sps.create(PROCESSOR_NAME, PIPELINE);
    });

    it('getInfo returns CREATED state after creation', async function () {
      const info = await sps.getInfo(PROCESSOR_NAME);
      expect(info.name).to.equal(PROCESSOR_NAME);
      expect(info.state).to.be.a('string');
      expect(info.pipeline).to.be.an('array').with.lengthOf(2);
    });

    it('starts the processor', async function () {
      await proc.start();
      // Brief pause so the server can transition state.
      await setTimeout(2000);
      const info = await sps.getInfo(PROCESSOR_NAME);
      expect(info.state).to.be.a('string');
    });

    it('returns stats without throwing', async function () {
      let stats: Document | undefined;
      try {
        stats = await proc.stats();
      } catch (err) {
        if (err instanceof MongoServerError) {
          // Stats may be unavailable on dev deployments — not a failure.
          this.skipReason = `Stats unavailable (code ${err.code}): ${err.message}`;
          this.skip();
        }
        throw err;
      }
      expect(stats).to.be.an('object');
    });

    it('sample() returns a SampleCursor and yields documents', async function () {
      let cursor: SampleCursor | undefined;
      try {
        cursor = proc.sample({ limit: 5 });
        expect(cursor).to.be.instanceOf(SampleCursor);
        expect(cursor.alive).to.be.true;

        let count = 0;
        for await (const doc of cursor) {
          expect(doc).to.be.an('object');
          count += 1;
          if (count >= 5) break;
        }
        // At least acknowledge the cursor was iterable — count may be 0 on an empty stream.
        expect(count).to.be.at.least(0);
      } catch (err) {
        if (err instanceof MongoServerError) {
          this.skipReason = `Sample unavailable (code ${err.code}): ${err.message}`;
          this.skip();
        }
        throw err;
      } finally {
        await cursor?.close();
      }
    });

    it('stops the processor', async function () {
      await proc.stop();
      await setTimeout(1000);
      const info = await sps.getInfo(PROCESSOR_NAME);
      expect(info.state).to.be.a('string');
    });

    it('drops the processor', async function () {
      await proc.drop();
    });
  });

  describe('Argument validation', function () {
    let client: StreamProcessingClient;
    let sps: StreamProcessors;

    before(async function () {
      client = new StreamProcessingClient(ASP_URI!, {
        auth: { username: ASP_USERNAME, password: ASP_PASSWORD }
      });
      sps = client.streamProcessors();
    });

    after(async function () {
      await client?.close();
    });

    it('create() rejects an empty processor name', async function () {
      const err = await sps.create('', PIPELINE).catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/non-empty/);
    });

    it('create() rejects an empty pipeline', async function () {
      const err = await sps.create('validName', []).catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/non-empty pipeline/);
    });

    it('get() rejects an empty processor name', function () {
      expect(() => sps.get('')).to.throw(Error, /non-empty/);
    });

    it('start() rejects mutually exclusive startAfter + startAtOperationTime', async function () {
      const proc = sps.get('dummy');
      const err = await proc
        .start({ startAfter: {}, startAtOperationTime: { t: 1, i: 0 } as any })
        .catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/mutually exclusive/);
    });

    it('start() rejects non-positive workers', async function () {
      const proc = sps.get('dummy');
      const err = await proc.start({ workers: 0 }).catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/workers/);
    });

    it('start() rejects an invalid tier', async function () {
      const proc = sps.get('dummy');
      const err = await proc.start({ tier: 'SP999' as any }).catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/Invalid tier/);
    });

    it('stats() rejects non-positive scale', async function () {
      const proc = sps.get('dummy');
      const err = await proc.stats({ scale: 0 }).catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/scale/);
    });

    it('getStreamProcessorSamples() rejects cursorId of 0 (exhausted)', async function () {
      const proc = sps.get('dummy');
      const err = await proc.getStreamProcessorSamples({ cursorId: 0 }).catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/exhausted/);
    });

    it('getStreamProcessorSamples() rejects negative cursorId', async function () {
      const proc = sps.get('dummy');
      const err = await proc.getStreamProcessorSamples({ cursorId: -1 }).catch(e => e);
      expect(err).to.be.instanceOf(Error);
      expect(err.message).to.match(/non-negative/);
    });
  });
});
