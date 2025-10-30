import * as v8 from 'node:v8';

import { expect } from 'chai';

import { sleep } from '../../tools/utils';
import { runScriptAndReturnHeapInfo } from './resource_tracking_script_builder';

/**
 * This 5MB range is selected arbitrarily and should likely be raised if failures are seen intermittently.
 *
 * The goal here is to catch unbounded memory growth, currently runScript defaults to 100 iterations of whatever test code is passed in
 * More than a 5MB growth in memory usage after the script has finished and _should have_ cleaned up all its resources likely indicates that
 * the growth will continue if the script is changed to iterate the the test code more.
 */
const MB_PERMITTED_OFFSET = 5;

describe('Driver Resources', () => {
  let startingMemoryUsed;
  let endingMemoryUsed;
  let clientsInMemory;

  beforeEach(function () {
    if (globalThis.AbortController == null) {
      if (this.currentTest) this.currentTest.skipReason = 'Need AbortController to run this test';
      this.currentTest?.skip();
    }
    if (typeof this.configuration.serverApi === 'string') {
      if (this.currentTest) {
        this.currentTest.skipReason = 'runScript does not support serverApi settings';
      }
      this.currentTest?.skip();
    }
  });

  context('on MongoClient.close()', () => {
    before('create leak reproduction script', async function () {
      if (globalThis.AbortController == null || typeof this.configuration.serverApi === 'string') {
        return;
      }
      const res = await runScriptAndReturnHeapInfo(
        'no_resource_leak_connect_close',
        this.configuration,
        async function run({ MongoClient, uri }) {
          const mongoClient = new MongoClient(uri, { minPoolSize: 100 });
          await mongoClient.connect();
          // Any operations will reproduce the issue found in v5.0.0/v4.13.0
          // it would seem the MessageStream has to be used?
          await mongoClient.db().command({ ping: 1 });
          await mongoClient.close();
        }
      );

      startingMemoryUsed = res.startingMemoryUsed;
      endingMemoryUsed = res.endingMemoryUsed;
      clientsInMemory = res.clientsInMemory;
    });

    describe('ending memory usage', () => {
      it(`is within ${MB_PERMITTED_OFFSET}MB of starting amount`, async () => {
        // Why check the lower bound? No reason, but it would be very surprising if we managed to free MB_PERMITTED_OFFSET MB of memory
        // I expect us to **never** be below the lower bound, but I'd want to know if it happened
        expect(
          endingMemoryUsed,
          `script started with ${startingMemoryUsed}MB heap but ended with ${endingMemoryUsed}MB heap used`
        ).to.be.within(
          startingMemoryUsed - MB_PERMITTED_OFFSET,
          startingMemoryUsed + MB_PERMITTED_OFFSET
        );
      });
    });

    describe('ending heap snapshot', () => {
      it('has 0 MongoClients in memory', async () => {
        // lengthOf crashes chai b/c it tries to print out a gigantic diff
        expect(
          clientsInMemory,
          `expected no MongoClients in the heapsnapshot, found ${clientsInMemory}`
        ).to.equal(0);
      });
    });
  });

  context('when 100s of operations are executed and complete', () => {
    beforeEach(function () {
      if (this.currentTest && typeof v8.queryObjects !== 'function') {
        this.currentTest.skipReason = 'Test requires v8.queryObjects API to count Promises';
        this.currentTest?.skip();
      }
    });

    let client;
    beforeEach(async function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      await client.close();
    });

    it('does not leave behind additional promises', async () => {
      const test = client.db('test').collection('test');
      const promiseCountBefore = v8.queryObjects(Promise, { format: 'count' });
      for (let i = 0; i < 100; i++) {
        await test.findOne();
      }
      await sleep(10);
      const promiseCountAfter = v8.queryObjects(Promise, { format: 'count' });

      expect(promiseCountAfter).to.be.lessThan(promiseCountBefore + 5);
    });
  });
});
