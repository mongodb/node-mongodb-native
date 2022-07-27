import { expect } from 'chai';
import { inspect } from 'util';

import {
  Collection,
  CommandStartedEvent,
  FindCursor,
  MongoClient,
  MongoCursorExhaustedError,
  MongoServerError
} from '../../../src';
import { sleep } from '../../tools/utils';
import { assert as test, setupDatabase } from '../shared';

describe('MaxTimeMS', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('Should Correctly respect the maxTimeMS property on count', function (done) {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    client.connect(function () {
      const db = client.db(configuration.db);
      const col = db.collection('max_time_ms');

      // Insert a couple of docs
      const docs_1 = [{ agg_pipe: 1 }];

      // Simple insert
      col.insertMany(docs_1, { writeConcern: { w: 1 } }, function (err) {
        expect(err).to.not.exist;

        // Execute a find command
        col
          .find({ $where: 'sleep(100) || true' })
          .maxTimeMS(50)
          .count(function (err) {
            test.ok(err != null);
            client.close(done);
          });
      });
    });
  });

  it('Should Correctly respect the maxTimeMS property on toArray', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function () {
        const db = client.db(configuration.db);
        const col = db.collection('max_time_ms_2');

        // Insert a couple of docs
        const docs_1 = [{ agg_pipe: 1 }];

        // Simple insert
        col.insertMany(docs_1, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;

          // Execute a find command
          col
            .find({ $where: 'sleep(100) || true' })
            .maxTimeMS(50)
            .toArray(function (err) {
              test.ok(err != null);
              client.close(done);
            });
        });
      });
    }
  });

  it('Should Correctly fail with maxTimeMS error', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: {
      requires: {
        topology: ['single', 'replicaset']
      }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function () {
        const db = client.db(configuration.db);
        const col = db.collection('max_time_ms_5');

        // Insert a couple of docs
        const docs_1 = [{ agg_pipe: 10 }];

        // Simple insert
        col.insertMany(docs_1, { writeConcern: { w: 1 } }, function (err) {
          expect(err).to.not.exist;

          db.admin().command(
            { configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'alwaysOn' },
            function (err, result) {
              expect(err).to.not.exist;
              test.equal(1, result?.ok);

              col
                .find({})
                .maxTimeMS(10)
                .toArray(function (err) {
                  test.ok(err != null);

                  db.admin().command(
                    { configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'off' },
                    function (err, result) {
                      expect(err).to.not.exist;
                      test.equal(1, result?.ok);
                      client.close(done);
                    }
                  );
                });
            }
          );
        });
      });
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
      await sleep(500);
      cappedCollection = await client
        .db()
        .createCollection('cappedAt3', { capped: true, size: 4096, max: 3 });
      cappedCollection.insertMany(insertedDocs);

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
                options: { tailable, awaitData, maxAwaitTimeMS, maxTimeMS },
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

    for (const { options, outcome } of tests) {
      let optionsString = inspect(options, { breakLength: Infinity });
      optionsString = optionsString
        .slice(2, optionsString.length - 2)
        .split('undefined')
        .join('omit');

      it(`should create find cursor with ${optionsString}`, async () => {
        cursor = cappedCollection.find({ _id: { $gt: 0 } }, { ...options, batchSize: 1 });

        const findDocOrError: { _id: number } | Error = await cursor.next().catch(error => error);

        const exhaustedByFind = !!cursor.id?.isZero();

        const getMoreDocOrError: { _id: number } | Error | null = await cursor
          .tryNext()
          .catch(error => error);

        expect(events).to.have.length.of.at.least(1); // At least find must be sent

        if (outcome.isFindError) {
          expect(findDocOrError).to.be.instanceOf(MongoServerError);
        } else {
          if (findDocOrError instanceof Error) {
            throw findDocOrError;
          }
          expect(findDocOrError).to.have.property('_id', 1);

          expect(events[0].command).to.be.an('object').that.has.a.property('find');
          const findCommand = events[0].command;

          if (typeof options.maxTimeMS === 'number') {
            expect(findCommand).to.have.property('maxTimeMS', options.maxTimeMS);
          } else {
            expect(findCommand).to.not.have.property('maxTimeMS');
          }
        }

        if (outcome.isGetMoreError) {
          expect(getMoreDocOrError).to.be.instanceOf(MongoServerError);
        } else if (exhaustedByFind) {
          expect(getMoreDocOrError).to.be.instanceOf(MongoCursorExhaustedError);
        } else {
          if (getMoreDocOrError instanceof Error) {
            throw getMoreDocOrError;
          }
          expect(getMoreDocOrError).to.be.null;

          expect(events[1].command).to.be.an('object').that.has.a.property('getMore');
          const getMoreCommand = events[1].command;

          if (typeof options.maxAwaitTimeMS === 'number') {
            expect(getMoreCommand).to.have.property('maxTimeMS', options.maxAwaitTimeMS);
          } else {
            expect(getMoreCommand).to.not.have.property('maxTimeMS');
          }
        }

        await cursor.close();
      });
    }
  });
});
