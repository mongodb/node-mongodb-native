import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from 'chai';
import * as process from 'process';

import {
  AbstractCursor,
  type AbstractCursorOptions,
  type ClientSession,
  CursorResponse,
  type InitialCursorResponse,
  MongoClient,
  ns,
  type Server
} from '../../mongodb';
/** Minimal do nothing cursor to focus on testing the base cursor behavior */
class ConcreteCursor extends AbstractCursor {
  constructor(client: MongoClient, options: AbstractCursorOptions = {}) {
    super(client, ns('test.test'), options);
  }
  clone(): ConcreteCursor {
    return new ConcreteCursor(new MongoClient('mongodb://iLoveJavascript'));
  }
  async _initialize(session: ClientSession): Promise<InitialCursorResponse> {
    const response = CursorResponse.emptyGetMore;
    return { server: {} as Server, session, response };
  }
}

/**
 * Runs in a child process (stringified): iterates a cursor whose getMores never run dry.
 * Every getMore returns the same pre-serialized batch of `docsPerBatch` tiny documents.
 */
async function consumeInfiniteCursor(
  bundlePath: string,
  docsPerBatch: number,
  docsToConsume: number
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AbstractCursor, CursorResponse, MongoClient, ns, serialize } = require(bundlePath);

  const nextBatch = Array.from({ length: docsPerBatch }, (_, i) => ({ username: `user_${i}` }));
  const reply = serialize({ ok: 1, cursor: { id: 1n, ns: 'test.test', nextBatch } });

  class InfiniteCursor extends AbstractCursor {
    clone() {
      throw new Error('not implemented');
    }
    async _initialize(session) {
      return { server: {}, session, response: new CursorResponse(reply) };
    }
    async getMore() {
      return new CursorResponse(reply);
    }
  }

  const cursor = new InfiniteCursor(new MongoClient('mongodb://iLoveJavascript'), ns('test.test'));
  for (let consumed = 0; consumed < docsToConsume; consumed++) await cursor.next();
  // the cursor is never exhausted, so exit instead of letting close() try to kill it on a server
  process.exit(0);
}

describe('class AbstractCursor', () => {
  let client: MongoClient;

  beforeEach(async function () {
    client = new MongoClient('mongodb://iLoveJavascript');
  });

  context('#constructor', () => {
    it('does not create a session if none passed in', () => {
      const cursor = new ConcreteCursor(client);
      expect(cursor).to.have.property('session').that.is.null;
    });

    it('uses the passed in session', async () => {
      const session = client.startSession();
      const cursor = new ConcreteCursor(client, { session });
      expect(cursor).to.have.property('session', session);
      await session.endSession();
    });
  });

  // NODE-7863: a server that sizes getMores by bytes (16MiB) returns hundreds of thousands of
  // small documents per batch; iterating them must not retain memory per consumed document.
  context.only('when iterating an infinite cursor under a constrained heap', function () {
    this.timeout(60_000);

    const bundlePath = path.resolve(__dirname, '../../tools/runner/bundle/driver-bundle.js');
    const maxOldSpaceSizeMB = 192;
    const docsToConsume = 1_200_000;

    function iterateInChildProcess(docsPerBatch: number) {
      if (!fs.existsSync(bundlePath)) {
        throw new Error(
          `Driver bundle not found at ${bundlePath}. Run 'npm run bundle:driver' first.`
        );
      }
      const script = `(${consumeInfiniteCursor})(${JSON.stringify(bundlePath)}, ${docsPerBatch}, ${docsToConsume})`;
      return spawnSync(
        process.execPath,
        [`--max-old-space-size=${maxOldSpaceSizeMB}`, '-e', script],
        {
          encoding: 'utf8'
        }
      );
    }

    it('does not run out of memory with small batches', function () {
      const { status, signal, stderr } = iterateInChildProcess(1000);
      expect({ status, signal }, stderr).to.deep.equal({ status: 0, signal: null });
    });

    it('does not run out of memory with large batches of small documents', function () {
      // 400k docs is ~14.7MiB, roughly what a server returns for a `{ username: 1 }` projection
      const { status, signal, stderr } = iterateInChildProcess(400_000);
      expect({ status, signal }, stderr).to.deep.equal({ status: 0, signal: null });
    });
  });
});
