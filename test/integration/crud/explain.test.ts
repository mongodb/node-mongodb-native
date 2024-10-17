import { expect } from 'chai';
import { once } from 'events';

import {
  type Collection,
  type CommandStartedEvent,
  type Db,
  type Document,
  type MongoClient,
  MongoOperationTimeoutError,
  MongoServerError,
  squashError
} from '../../mongodb';
import { clearFailPoint, configureFailPoint, measureDuration } from '../../tools/utils';
import { filterForCommands } from '../shared';

const explain = [true, false, 'queryPlanner', 'allPlansExecution', 'executionStats', 'invalid'];

describe('CRUD API explain option', function () {
  let client: MongoClient;
  let db: Db;
  let collection: Collection;
  let commandStartedPromise: Promise<CommandStartedEvent[]>;
  const ops = [
    {
      name: 'deleteOne',
      op: async (explain: boolean | string) => await collection.deleteOne({ a: 1 }, { explain })
    },
    {
      name: 'deleteMany',
      op: async (explain: boolean | string) => await collection.deleteMany({ a: 1 }, { explain })
    },
    {
      name: 'updateOne',
      op: async (explain: boolean | string) =>
        await collection.updateOne({ a: 1 }, { $inc: { a: 2 } }, { explain })
    },
    {
      name: 'updateMany',
      op: async (explain: boolean | string) =>
        await collection.updateMany({ a: 1 }, { $inc: { a: 2 } }, { explain })
    },
    {
      name: 'distinct',
      op: async (explain: boolean | string) => await collection.distinct('a', {}, { explain })
    },
    {
      name: 'findOneAndDelete',
      op: async (explain: boolean | string) =>
        await collection.findOneAndDelete({ a: 1 }, { explain, includeResultMetadata: true })
    },
    {
      name: 'findOne',
      op: async (explain: boolean | string) => {
        return await collection.findOne({ a: 1 }, { explain });
      }
    },
    { name: 'find', op: (explain: boolean | string) => collection.find({ a: 1 }).explain(explain) },
    {
      name: 'findOneAndReplace',
      op: async (explain: boolean | string) =>
        await collection.findOneAndReplace(
          { a: 1 },
          { a: 2 },
          { explain, includeResultMetadata: true }
        )
    },
    {
      name: 'aggregate',
      op: async (explain: boolean | string) =>
        await collection
          .aggregate([{ $project: { a: 1 } }, { $group: { _id: '$a' } }], { explain })
          .toArray()
    }
  ];

  beforeEach(async function () {
    client = this.configuration.newClient({ monitorCommands: true });
    db = client.db('queryPlannerExplainResult');
    collection = db.collection('test');
    await collection.insertOne({ a: 1 });
    commandStartedPromise = once(client, 'commandStarted');
  });

  afterEach(async function () {
    await collection.drop();
    await client.close();
  });

  for (const explainValue of explain) {
    for (const op of ops) {
      const name = op.name;
      context(`When explain is ${explainValue}, operation ${name}`, function () {
        it(`sets command verbosity to ${explainValue} and includes ${explainValueToExpectation(explainValue)} in the return response`, async function () {
          const response = await op.op(explainValue).catch(error => error);
          if (response instanceof Error && !(response instanceof MongoServerError)) {
            throw response;
          }
          const commandStartedEvent = await commandStartedPromise;
          const explainJson = JSON.stringify(response);
          switch (explainValue) {
            case true:
            case 'allPlansExecution':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('allPlansExecution');
              expect(explainJson).to.include('queryPlanner');
              break;
            case false:
            case 'queryPlanner':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('queryPlanner');
              expect(explainJson).to.include('queryPlanner');
              break;
            case 'executionStats':
              expect(commandStartedEvent[0].command.verbosity).to.be.equal('executionStats');
              expect(explainJson).to.include('queryPlanner');
              break;
            default:
              // for invalid values of explain
              expect(response).to.be.instanceOf(MongoServerError);
              break;
          }
        });
      });
    }
  }

  describe('explain helpers w/ maxTimeMS', function () {
    let client: MongoClient;
    const commands: CommandStartedEvent[] = [];
    let collection: Collection;

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      await client.connect();

      await client.db('explain-test').dropDatabase();
      collection = await client.db('explain-test').createCollection('bar');

      client.on('commandStarted', filterForCommands('explain', commands));
      commands.length = 0;
    });

    afterEach(async function () {
      await client.close();
    });

    describe('maxTimeMS provided to explain, not to command', function () {
      describe('cursor commands', function () {
        describe('options API', function () {
          beforeEach(async function () {
            await collection
              .find({}, { explain: { maxTimeMS: 1000, verbosity: 'queryPlanner' } })
              .toArray();
          });

          it('attaches maxTimeMS to the explain command', expectOnExplain(1000));

          it('does not attach maxTimeMS to the find command', expectNotOnCommand());
        });

        describe('fluent API', function () {
          beforeEach(async function () {
            await collection.find({}).explain({ maxTimeMS: 1000, verbosity: 'queryPlanner' });
          });

          it('attaches maxTimeMS to the explain command', expectOnExplain(1000));

          it('does not attach maxTimeMS to the find command', expectNotOnCommand());
        });
      });

      describe('non-cursor commands', function () {
        beforeEach(async function () {
          await collection.deleteMany(
            {},
            { explain: { maxTimeMS: 1000, verbosity: 'queryPlanner' } }
          );
        });

        it('attaches maxTimeMS to the explain command', expectOnExplain(1000));

        it('does not attach maxTimeMS to the explained command', expectNotOnCommand());
      });
    });

    describe('maxTimeMS provided to command, not explain', function () {
      describe('cursor commands', function () {
        describe('options API', function () {
          beforeEach(async function () {
            await collection
              .find({}, { maxTimeMS: 1000, explain: { verbosity: 'queryPlanner' } })
              .toArray();
          });

          it('does not attach maxTimeMS to the explain command', expectNotOnExplain());

          it('attaches maxTimeMS to the find command', expectOnCommand(1000));
        });

        describe('fluent API', function () {
          beforeEach(async function () {
            await collection.find({}, { maxTimeMS: 1000 }).explain({ verbosity: 'queryPlanner' });
          });

          it('does not attach maxTimeMS to the explain command', expectNotOnExplain());

          it('attaches maxTimeMS to the find command', expectOnCommand(1000));
        });
      });

      describe('non-cursor commands', function () {
        beforeEach(async function () {
          await collection.deleteMany(
            {},
            { maxTimeMS: 1000, explain: { verbosity: 'queryPlanner' } }
          );
        });

        it('does nto attach maxTimeMS to the explain command', expectNotOnExplain());

        it('attaches maxTimeMS to the explained command', expectOnCommand(1000));
      });
    });

    describe('maxTimeMS specified in command options and explain options', function () {
      describe('cursor commands', function () {
        describe('options API', function () {
          beforeEach(async function () {
            await collection
              .find(
                {},
                { maxTimeMS: 1000, explain: { maxTimeMS: 2000, verbosity: 'queryPlanner' } }
              )
              .toArray();
          });

          it('attaches maxTimeMS from the explain options to explain', expectOnExplain(2000));

          it('attaches maxTimeMS from the find options to the find command', expectOnCommand(1000));
        });

        describe('fluent API', function () {
          beforeEach(async function () {
            await collection
              .find({}, { maxTimeMS: 1000 })
              .explain({ maxTimeMS: 2000, verbosity: 'queryPlanner' });
          });

          it('attaches maxTimeMS from the explain options to explain', expectOnExplain(2000));

          it('attaches maxTimeMS from the find options to the find command', expectOnCommand(1000));
        });
      });

      describe('non-cursor commands', function () {
        beforeEach(async function () {
          await collection.deleteMany(
            {},
            { maxTimeMS: 1000, explain: { maxTimeMS: 2000, verbosity: 'queryPlanner' } }
          );
        });

        it('attaches maxTimeMS to the explain command', expectOnExplain(2000));

        it('attaches maxTimeMS to the explained command', expectOnCommand(1000));
      });
    });

    function expectOnExplain(value: number) {
      return function () {
        const [{ command }] = commands;
        expect(command).to.have.property('maxTimeMS', value);
      };
    }

    function expectNotOnExplain() {
      return function () {
        const [{ command }] = commands;
        expect(command).not.to.have.property('maxTimeMS');
      };
    }

    function expectOnCommand(value: number) {
      return function () {
        const [
          {
            command: { explain }
          }
        ] = commands;
        expect(explain).to.have.property('maxTimeMS', value);
      };
    }
    function expectNotOnCommand() {
      return function () {
        const [
          {
            command: { explain }
          }
        ] = commands;
        expect(explain).not.to.have.property('maxTimeMS');
      };
    }
  });

  describe('explain with timeoutMS', function () {
    let client: MongoClient;
    type ExplainStartedEvent = CommandStartedEvent & {
      command: { explain: Document & { maxTimeMS?: number }; maxTimeMS?: number };
    };
    const commands: ExplainStartedEvent[] = [];

    describe('Explain helpers respect timeoutMS', function () {
      afterEach(async function () {
        await clearFailPoint(
          this.configuration,
          this.configuration.url({ useMultipleMongoses: false })
        );
      });

      beforeEach(async function () {
        const uri = this.configuration.url({ useMultipleMongoses: false });
        await configureFailPoint(
          this.configuration,
          {
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['explain'],
              blockConnection: true,
              blockTimeMS: 2000
            }
          },
          this.configuration.url({ useMultipleMongoses: false })
        );

        client = this.configuration.newClient(uri, { monitorCommands: true });
        client.on('commandStarted', filterForCommands('explain', commands));
        await client.connect();
      });

      afterEach(async function () {
        await client?.close();
        commands.length = 0;
      });

      describe('when a cursor api is being explained', function () {
        describe('when timeoutMS is provided', function () {
          it(
            'the explain command times out after timeoutMS',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const cursor = client.db('foo').collection('bar').find({}, { timeoutMS: 1000 });
              const { duration, result } = await measureDuration(() =>
                cursor.explain({ verbosity: 'queryPlanner' }).catch(e => e)
              );

              expect(result).to.be.instanceOf(MongoOperationTimeoutError);
              expect(duration).to.be.within(1000 - 100, 1000 + 100);
            }
          );

          it(
            'the explain command has the calculated maxTimeMS value attached',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const cursor = client.db('foo').collection('bar').find({}, { timeoutMS: 1000 });
              const timeout = await cursor.explain({ verbosity: 'queryPlanner' }).catch(e => e);
              expect(timeout).to.be.instanceOf(MongoOperationTimeoutError);

              const [
                {
                  command: { maxTimeMS }
                }
              ] = commands;

              expect(maxTimeMS).to.be.a('number');
            }
          );

          it(
            'the explained command does not have a maxTimeMS value attached',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const cursor = client.db('foo').collection('bar').find({}, { timeoutMS: 1000 });
              const timeout = await cursor.explain({ verbosity: 'queryPlanner' }).catch(e => e);
              expect(timeout).to.be.instanceOf(MongoOperationTimeoutError);

              const [
                {
                  command: {
                    explain: { maxTimeMS }
                  }
                }
              ] = commands;

              expect(maxTimeMS).not.to.exist;
            }
          );
        });

        describe('when timeoutMS and maxTimeMS are both provided', function () {
          it(
            'an error is thrown indicating incompatibility of those options',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const cursor = client.db('foo').collection('bar').find({}, { timeoutMS: 1000 });
              const error = await cursor
                .explain({ verbosity: 'queryPlanner', maxTimeMS: 1000 })
                .catch(e => e);
              expect(error).to.match(/Cannot use maxTimeMS with timeoutMS for explain commands/);
            }
          );
        });
      });

      describe('when a non-cursor api is being explained', function () {
        describe('when timeoutMS is provided', function () {
          it(
            'the explain command times out after timeoutMS',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const { duration, result } = await measureDuration(() =>
                client
                  .db('foo')
                  .collection('bar')
                  .deleteMany(
                    {},
                    {
                      timeoutMS: 1000,
                      explain: { verbosity: 'queryPlanner' }
                    }
                  )
                  .catch(e => e)
              );

              expect(result).to.be.instanceOf(MongoOperationTimeoutError);
              expect(duration).to.be.within(1000 - 100, 1000 + 100);
            }
          );

          it(
            'the explain command has the calculated maxTimeMS value attached',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const timeout = await client
                .db('foo')
                .collection('bar')
                .deleteMany(
                  {},
                  {
                    timeoutMS: 1000,
                    explain: { verbosity: 'queryPlanner' }
                  }
                )
                .catch(e => e);

              expect(timeout).to.be.instanceOf(MongoOperationTimeoutError);

              const [
                {
                  command: { maxTimeMS }
                }
              ] = commands;

              expect(maxTimeMS).to.be.a('number');
            }
          );

          it(
            'the explained command does not have a maxTimeMS value attached',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const timeout = await client
                .db('foo')
                .collection('bar')
                .deleteMany(
                  {},
                  {
                    timeoutMS: 1000,
                    explain: { verbosity: 'queryPlanner' }
                  }
                )
                .catch(e => e);

              expect(timeout).to.be.instanceOf(MongoOperationTimeoutError);

              const [
                {
                  command: {
                    explain: { maxTimeMS }
                  }
                }
              ] = commands;

              expect(maxTimeMS).not.to.exist;
            }
          );
        });

        describe('when timeoutMS and maxTimeMS are both provided', function () {
          it(
            'an error is thrown indicating incompatibility of those options',
            { requires: { mongodb: '>=4.4' } },
            async function () {
              const error = await client
                .db('foo')
                .collection('bar')
                .deleteMany(
                  {},
                  {
                    timeoutMS: 1000,
                    explain: { verbosity: 'queryPlanner', maxTimeMS: 1000 }
                  }
                )
                .catch(e => e);

              expect(error).to.match(/Cannot use maxTimeMS with timeoutMS for explain commands/);
            }
          );
        });
      });

      describe('when find({}, { explain: ...}) is used with timeoutMS', function () {
        it(
          'an error is thrown indicating that explain is not supported with timeoutMS for this API',
          { requires: { mongodb: '>=4.4' } },
          async function () {
            const error = await client
              .db('foo')
              .collection('bar')
              .find(
                {},
                {
                  timeoutMS: 1000,
                  explain: { verbosity: 'queryPlanner', maxTimeMS: 1000 }
                }
              )
              .toArray()
              .catch(e => e);

            expect(error).to.match(
              /timeoutMS cannot be used with explain when explain is specified in findOptions/
            );
          }
        );
      });

      describe('when aggregate({}, { explain: ...}) is used with timeoutMS', function () {
        it(
          'an error is thrown indicating that explain is not supported with timeoutMS for this API',
          { requires: { mongodb: '>=4.4' } },
          async function () {
            const error = await client
              .db('foo')
              .collection('bar')
              .aggregate([], {
                timeoutMS: 1000,
                explain: { verbosity: 'queryPlanner', maxTimeMS: 1000 }
              })
              .toArray()
              .catch(e => e);

            expect(error).to.match(
              /timeoutMS cannot be used with explain when explain is specified in aggregateOptions/
            );
          }
        );
      });
    });

    describe('fluent api timeoutMS precedence and inheritance', function () {
      beforeEach(async function () {
        client = this.configuration.newClient({}, { monitorCommands: true });
        client.on('commandStarted', filterForCommands('explain', commands));
        await client.connect();
        await client.db('foo').dropDatabase().catch(squashError);
        await client.db('foo').createCollection('bar');
      });

      afterEach(async function () {
        await client?.close();
        commands.length = 0;
      });

      /**
       * The tests in this section test that timeoutMS is respected by asserting that when specified,
       * maxTimeMS is set on the explain command.  That should only ever be true when timeoutMS is
       * set, but if that is true when timeoutMS is not set, that could cause these tests to pass
       * erroneously.
       *
       * These tests assert that maxTimeMS is not present on commands when timeoutMS is not provided.
       */
      describe('precondition tests', function () {
        beforeEach('find does not set maxTimeMS if timeoutMS is not set', async function () {
          {
            const cursor = client.db('foo').collection('bar').find();
            await cursor.explain({ verbosity: 'queryPlanner' });

            const [
              {
                command: { maxTimeMS }
              }
            ] = commands;
            expect(maxTimeMS).not.to.exist;
            commands.length = 0;
          }
        });

        beforeEach('aggregate does not set maxTimeMS if timeoutMS is not set', async function () {
          {
            const cursor = client.db('foo').collection('bar').aggregate([]);
            await cursor.explain({ verbosity: 'queryPlanner' });

            const [
              {
                command: { maxTimeMS }
              }
            ] = commands;
            expect(maxTimeMS).not.to.exist;
            commands.length = 0;
          }
        });
      });

      describe('find({}, { timeoutMS }).explain()', function () {
        it('respects the timeoutMS from the find options', async function () {
          const cursor = client.db('foo').collection('bar').find({}, { timeoutMS: 800 });
          await cursor.explain({ verbosity: 'queryPlanner' });

          const [
            {
              command: { maxTimeMS }
            }
          ] = commands;
          expect(maxTimeMS).to.exist;
        });
      });

      describe('find().explain({}, { timeoutMS })', function () {
        it('respects the timeoutMS from the explain helper', async function () {
          const cursor = client.db('foo').collection('bar').find();
          await cursor.explain({ verbosity: 'queryPlanner' }, { timeoutMS: 800 });

          const [
            {
              command: { maxTimeMS }
            }
          ] = commands;
          expect(maxTimeMS).to.exist;
        });
      });

      describe('find({}, { timeoutMS} ).explain({}, { timeoutMS })', function () {
        it('the timeoutMS from the explain helper has precedence', async function () {
          const cursor = client.db('foo').collection('bar').find({}, { timeoutMS: 100 });
          await cursor.explain({ verbosity: 'queryPlanner' }, { timeoutMS: 800 });
          const [
            {
              command: { maxTimeMS }
            }
          ] = commands;
          expect(maxTimeMS).to.exist;
          expect(maxTimeMS).to.be.greaterThan(100);
        });
      });

      describe('aggregate([], { timeoutMS }).explain()', function () {
        it('respects the timeoutMS from the find options', async function () {
          const cursor = client.db('foo').collection('bar').aggregate([], { timeoutMS: 800 });
          await cursor.explain({ verbosity: 'queryPlanner' });

          const [
            {
              command: { maxTimeMS }
            }
          ] = commands;
          expect(maxTimeMS).to.exist;
        });
      });

      describe('aggregate([], { timeoutMS })', function () {
        it('respects the timeoutMS from the explain helper', async function () {
          const cursor = client.db('foo').collection('bar').aggregate();
          await cursor.explain({ verbosity: 'queryPlanner' }, { timeoutMS: 800 });
          const [
            {
              command: { maxTimeMS }
            }
          ] = commands;
          expect(maxTimeMS).to.exist;
        });
      });

      describe('aggregate([], { timeoutMS} ).explain({}, { timeoutMS })', function () {
        it('the timeoutMS from the explain helper has precedence', async function () {
          const cursor = client.db('foo').collection('bar').aggregate([], { timeoutMS: 100 });
          await cursor.explain({ verbosity: 'queryPlanner' }, { timeoutMS: 800 });
          const [
            {
              command: { maxTimeMS }
            }
          ] = commands;
          expect(maxTimeMS).to.exist;
          expect(maxTimeMS).to.be.greaterThan(100);
        });
      });
    });
  });
});

function explainValueToExpectation(explainValue: boolean | string) {
  switch (explainValue) {
    case true:
    case 'allPlansExecution':
      return 'queryPlanner, executionStats, and nested allPlansExecution properties';
    case false:
    case 'queryPlanner':
      return 'only queryPlanner property';
    case 'executionStats':
      return 'queryPlanner and executionStats property';
    default:
      return 'error';
  }
}
