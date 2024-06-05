import { expect } from 'chai';
import { inspect } from 'util';

import {
  type Collection,
  type CommandStartedEvent,
  type FindCursor,
  type MongoClient,
  MongoCursorExhaustedError,
  MongoServerError
} from '../../mongodb';

describe('MaxTimeMS', function () {
  let client: MongoClient;
  let commandStartedEvents: CommandStartedEvent[];

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    commandStartedEvents = [];
    client.on('commandStarted', ev => commandStartedEvents.push(ev));
  });

  afterEach(async function () {
    commandStartedEvents = [];
    await client.close();
  });

  it('should correctly respect the maxTimeMS property on count', async function () {
    const col = client.db().collection('max_time_ms');
    await col.insertMany([{ agg_pipe: 1 }], { writeConcern: { w: 1 } });
    const cursor = col.find({ $where: 'sleep(100) || true' }).maxTimeMS(50);
    // @ts-expect-error: findOptions are private
    expect(cursor.findOptions).to.have.property('maxTimeMS', 50);

    const error = await cursor.count().catch(error => error);
    expect(error).to.be.instanceOf(MongoServerError);

    const countCommandEvent = commandStartedEvents.find(ev => ev.commandName === 'count');
    expect(countCommandEvent).to.have.nested.property('command.maxTimeMS', 50);
  });

  it('should correctly respect the maxTimeMS property on toArray', async function () {
    const col = client.db().collection('max_time_ms');
    await col.insertMany([{ agg_pipe: 1 }], { writeConcern: { w: 1 } });
    const cursor = col.find({ $where: 'sleep(100) || true' }).maxTimeMS(50);
    // @ts-expect-error: findOptions are private
    expect(cursor.findOptions).to.have.property('maxTimeMS', 50);

    const error = await cursor.toArray().catch(error => error);
    expect(error).to.be.instanceOf(MongoServerError);

    const findCommandEvent = commandStartedEvents.find(ev => ev.commandName === 'find');
    expect(findCommandEvent).to.have.nested.property('command.maxTimeMS', 50);
  });

  it('should correctly fail with maxTimeMS error', async function () {
    const admin = client.db().admin();
    const col = client.db().collection('max_time_ms_5');

    await col.insertMany([{ agg_pipe: 10 }], { writeConcern: { w: 1 } });

    try {
      const res = await admin.command({
        configureFailPoint: 'maxTimeAlwaysTimeOut',
        mode: 'alwaysOn'
      });
      expect(res).to.have.property('ok', 1);

      const error = await col
        .find({})
        .maxTimeMS(10)
        .toArray()
        .catch(error => error);

      expect(error).to.be.instanceOf(MongoServerError);
    } finally {
      const res = await admin.command({ configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'off' });
      expect(res).to.have.property('ok', 1);
    }
  });

  describe('awaitData, tailable, maxTimeMS, and maxAwaitTimeMS on cursors', () => {
    const insertedDocs = [{ _id: 1 }];
    let client: MongoClient;
    let cappedCollection: Collection<{ _id: number }>;
    let cursor: FindCursor<{ _id: number }>;
    let events: CommandStartedEvent[];

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
      await client
        .db()
        .dropCollection('cappedAt3')
        .catch(() => null);
      cappedCollection = await client
        .db()
        .createCollection('cappedAt3', { capped: true, size: 4096, max: 3 });
      await cappedCollection.insertMany(insertedDocs);

      events = [];
      client.on('commandStarted', event =>
        ['getMore', 'find'].includes(event.commandName) ? events.push(event) : null
      );
    });

    afterEach(async function () {
      events = [];
      await cursor?.close();
      await client?.close();
    });

    const tailableValues = [true, false, undefined];
    const awaitDataValues = [true, false, undefined];
    const maxTimeMSValues = [100, 0, undefined];
    const maxAwaitTimeMSValues = [100, 0, undefined];

    const tests = tailableValues.flatMap(tailable =>
      awaitDataValues.flatMap(awaitData =>
        maxAwaitTimeMSValues.flatMap(maxAwaitTimeMS =>
          maxTimeMSValues.flatMap(maxTimeMS => {
            const awaitDataSet = Boolean(awaitData) === true;
            const tailableSet = Boolean(tailable) === true;
            const timeIsSetOnGetMore = typeof maxAwaitTimeMS === 'number';
            return [
              {
                // Use JSON to drop explicit undefined
                options: JSON.parse(
                  JSON.stringify({ tailable, awaitData, maxAwaitTimeMS, maxTimeMS })
                ),
                outcome: {
                  // Cannot set 'awaitData' without also setting 'tailable'
                  isFindError: awaitDataSet && !tailableSet,
                  // cannot set maxTimeMS on getMore command for a non-awaitData cursor
                  isGetMoreError: timeIsSetOnGetMore && !awaitDataSet
                }
              }
            ];
          })
        )
      )
    );

    it('meta test: should setup test table correctly', () => {
      expect(tests).to.have.lengthOf(81);
      expect(tests.filter(t => t.outcome.isFindError)).to.have.lengthOf(18);
      expect(tests.filter(t => t.outcome.isGetMoreError)).to.have.lengthOf(36);
      expect(
        tests.filter(t => {
          return !t.outcome.isFindError && !t.outcome.isGetMoreError;
        })
      ).to.have.lengthOf(27);
    });

    const metadata = { requires: { mongodb: '>=5', topology: ['replicaset'] as const } };
    for (const { options, outcome } of tests) {
      let optionsString = inspect(options, { breakLength: Infinity });
      optionsString = optionsString.slice(1, optionsString.length - 1).trim();
      optionsString = optionsString === '' ? 'nothing set' : optionsString;

      // Each test runs the same find operation, but asserts different outcomes
      const operation = async () => {
        cursor = cappedCollection.find({ _id: { $gt: 0 } }, { ...options, batchSize: 1 });
        const findDocOrError: { _id: number } | Error = await cursor.next().catch(error => error);
        const exhaustedByFind = !!cursor.id?.isZero();
        const getMoreDocOrError: { _id: number } | Error | null = await cursor
          .tryNext()
          .catch(error => error);
        expect(events).to.have.length.of.at.least(1); // At least find must be sent
        return { findDocOrError, exhaustedByFind, getMoreDocOrError };
      };

      if (outcome.isFindError) {
        it(`should error on find due to setting ${optionsString}`, metadata, async () => {
          const { findDocOrError } = await operation();
          expect(findDocOrError).to.be.instanceOf(MongoServerError);
        });
      } else if (outcome.isGetMoreError) {
        it(`should error on getMore due to setting ${optionsString}`, metadata, async () => {
          const { exhaustedByFind, getMoreDocOrError } = await operation();
          if (exhaustedByFind) {
            expect(getMoreDocOrError).to.be.instanceOf(MongoCursorExhaustedError);
          } else {
            expect(getMoreDocOrError).to.be.instanceOf(MongoServerError);
          }
        });
      } else {
        it(`should create find cursor with ${optionsString}`, metadata, async () => {
          const { findDocOrError: findDoc, getMoreDocOrError: getMoreDoc } = await operation();

          // @ts-expect-error: If this is an error it will have a stack worth seeing
          expect(findDoc, `${findDoc?.stack}`).to.not.be.instanceOf(Error);
          // @ts-expect-error: If this is an error it will have a stack worth seeing
          expect(getMoreDoc, `${getMoreDoc?.stack}`).to.not.be.instanceOf(Error);

          expect(findDoc).to.have.property('_id', 1);

          expect(events[0].command).to.be.an('object').that.has.a.property('find');
          const findCommand = events[0].command;

          if (typeof options.maxTimeMS === 'number') {
            expect(findCommand).to.have.property('maxTimeMS', options.maxTimeMS);
          } else {
            expect(findCommand).to.not.have.property('maxTimeMS');
          }

          expect(getMoreDoc).to.be.null;

          expect(events[1].command).to.be.an('object').that.has.a.property('getMore');
          const getMoreCommand = events[1].command;

          if (typeof options.maxAwaitTimeMS === 'number') {
            expect(getMoreCommand).to.have.property('maxTimeMS', options.maxAwaitTimeMS);
          } else {
            expect(getMoreCommand).to.not.have.property('maxTimeMS');
          }
        });
      }
    }
  });
});
