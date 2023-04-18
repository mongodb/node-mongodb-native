import { EJSON, ObjectId } from 'bson';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Readable, Writable } from 'stream';
import { inspect } from 'util';

import {
  COMMAND_FAILED,
  COMMAND_STARTED,
  COMMAND_SUCCEEDED,
  CONNECTION_CHECK_OUT_FAILED,
  CONNECTION_CHECK_OUT_STARTED,
  CONNECTION_CHECKED_IN,
  CONNECTION_CHECKED_OUT,
  CONNECTION_CLOSED,
  CONNECTION_CREATED,
  CONNECTION_POOL_CLEARED,
  CONNECTION_POOL_CLOSED,
  CONNECTION_POOL_CREATED,
  CONNECTION_POOL_READY,
  CONNECTION_READY,
  DEFAULT_MAX_DOCUMENT_LENGTH,
  Log,
  MongoDBLogWritable,
  MongoLogger,
  MongoLoggerOptions,
  SEVERITY_LEVEL_MAP,
  SeverityLevel,
  stringifyWithMaxLen
} from '../mongodb';

class BufferingStream extends Writable {
  buffer: any[] = [];

  constructor(options = {}) {
    super({ ...options, objectMode: true });
  }

  override _write(chunk, encoding, callback) {
    this.buffer.push(chunk);
    callback();
  }
}

describe('meta tests for BufferingStream', function () {
  it('the buffer is empty on construction', function () {
    const stream = new BufferingStream();
    expect(stream.buffer).to.have.lengthOf(0);
  });
  it('pushes messages to the buffer when written to', function () {
    const stream = new BufferingStream();
    stream.write('message');
    expect(stream.buffer).to.deep.equal(['message']);
  });
});

describe('class MongoLogger', function () {
  describe('#constructor()', function () {
    it('assigns each property from the options object onto the logging class', function () {
      const componentSeverities: MongoLoggerOptions['componentSeverities'] = {
        command: 'alert'
      } as any;
      const stream = new Writable();
      const logger = new MongoLogger({
        componentSeverities,
        maxDocumentLength: 10,
        logDestination: stream
      });

      expect(logger).to.have.property('componentSeverities', componentSeverities);
      expect(logger).to.have.property('maxDocumentLength', 10);
      expect(logger).to.have.property('logDestination', stream);
    });

    context('when logDestination is an object that implements MongoDBLogWritable', function () {
      it('successfully writes logs to the MongoDBLogWritable', function () {
        const logDestination = {
          buffer: [],
          write(log: Log) {
            this.buffer.push(log);
          }
        } as { buffer: any[]; write: (log: Log) => void };
        const logger = new MongoLogger({
          componentSeverities: { command: 'emergency' } as any,
          logDestination
        } as any);

        logger.emergency('command', 'Hello world!');
        expect(logDestination.buffer).to.have.lengthOf(1);
      });
    });

    context('when logDestination implements nodejs:stream.Writable', function () {
      it('successfully writes logs to the Writable', function () {
        const buffer: any[] = [];
        const logDestination = new Writable({
          objectMode: true,
          write(log: Log): void {
            buffer.push(log);
          }
        });

        const logger = new MongoLogger({
          componentSeverities: { command: 'emergency' } as any,
          logDestination
        } as any);

        logger.emergency('command', 'Hello world!');
        expect(buffer).to.have.lengthOf(1);
      });
    });
  });

  describe('static #resolveOptions()', function () {
    describe('componentSeverities', function () {
      const components = new Map([
        ['MONGODB_LOG_COMMAND', 'command'],
        ['MONGODB_LOG_TOPOLOGY', 'topology'],
        ['MONGODB_LOG_SERVER_SELECTION', 'serverSelection'],
        ['MONGODB_LOG_CONNECTION', 'connection']
      ]);

      function* makeValidOptions(): Generator<[string, string]> {
        const validOptions = Object.values(SeverityLevel).filter(
          option => option !== SeverityLevel.OFF
        );
        for (const option of validOptions) {
          yield [option, option];
          yield [option.toUpperCase(), option];
        }
      }

      const invalidOptions = ['', 'invalid-string'];
      const validNonDefaultOptions = new Map(makeValidOptions());

      context('default', () => {
        context('when MONGODB_LOG_ALL is unset', () => {
          it('sets default to OFF', () => {
            const { componentSeverities } = MongoLogger.resolveOptions({}, {});
            expect(componentSeverities.default).to.equal(SeverityLevel.OFF);
          });
        });

        context('when MONGODB_LOG_ALL is invalid', () => {
          for (const invalidOption of invalidOptions) {
            context(`{ MONGODB_LOG_ALL: '${invalidOption} }'`, () => {
              it('sets default to OFF', () => {
                const { componentSeverities } = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_ALL: invalidOption
                  },
                  {}
                );
                expect(componentSeverities.default).to.equal(SeverityLevel.OFF);
              });
            });
          }
        });

        context('when MONGODB_LOG_ALL is valid', () => {
          for (const [validOption, expectedValue] of validNonDefaultOptions) {
            context(`{ MONGODB_LOG_ALL: '${validOption}' }`, () => {
              it('sets default to the value of MONGODB_LOG_ALL', () => {
                const { componentSeverities } = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_ALL: validOption
                  },
                  {}
                );
                expect(componentSeverities.default).to.equal(expectedValue);
              });
            });
          }
        });
      });
      for (const [loggingComponent, componentSeverityOption] of components) {
        context(`when ${loggingComponent} is unset`, () => {
          context(`when MONGODB_LOG_ALL is unset`, () => {
            it(`sets ${componentSeverityOption} to OFF`, () => {
              const { componentSeverities } = MongoLogger.resolveOptions({}, {});
              expect(componentSeverities[componentSeverityOption]).to.equal(SeverityLevel.OFF);
            });
          });

          context(`when MONGODB_LOG_ALL is set to an invalid value`, () => {
            for (const invalidOption of invalidOptions) {
              context(`{ MONGODB_LOG_ALL: ${invalidOption} }`, () => {
                it(`sets ${invalidOption} to OFF`, () => {
                  const { componentSeverities } = MongoLogger.resolveOptions(
                    {
                      MONGODB_LOG_ALL: invalidOption
                    },
                    {}
                  );
                  expect(componentSeverities[componentSeverityOption]).to.equal(SeverityLevel.OFF);
                });
              });
            }
          });

          context(`when MONGODB_LOG_ALL is set to a valid value`, () => {
            for (const [option, expectedValue] of validNonDefaultOptions) {
              context(`{ MONGODB_LOG_ALL: ${option} }`, () => {
                it(`sets ${option} to the value of MONGODB_LOG_ALL`, () => {
                  const { componentSeverities } = MongoLogger.resolveOptions(
                    {
                      MONGODB_LOG_ALL: option
                    },
                    {}
                  );
                  expect(componentSeverities[componentSeverityOption]).to.equal(expectedValue);
                });
              });
            }
          });
        });

        context(`when ${loggingComponent} is set to an invalid value in the environment`, () => {
          context(`when MONGODB_LOG_ALL is unset`, () => {
            for (const invalidOption of invalidOptions) {
              context(`{ ${loggingComponent}: ${invalidOption} }`, () => {
                it(`sets ${componentSeverityOption} to OFF`, () => {
                  const { componentSeverities } = MongoLogger.resolveOptions(
                    {
                      [loggingComponent]: invalidOption
                    },
                    {}
                  );

                  expect(componentSeverities[componentSeverityOption]).to.equal(SeverityLevel.OFF);
                });
              });
            }
          });

          context(`when MONGODB_LOG_ALL is set to an invalid value`, () => {
            for (const invalidOption of invalidOptions) {
              context(
                `{ ${loggingComponent}: ${invalidOption}, MONGODB_LOG_ALL: ${invalidOption} }`,
                () => {
                  it(`sets ${componentSeverityOption} to OFF`, () => {
                    const { componentSeverities } = MongoLogger.resolveOptions(
                      {
                        [loggingComponent]: invalidOption,
                        MONGODB_LOG_ALL: invalidOption
                      },
                      {}
                    );

                    expect(componentSeverities[componentSeverityOption]).to.equal(
                      SeverityLevel.OFF
                    );
                  });
                }
              );
            }
          });

          context(`when MONGODB_LOG_ALL is set to a valid value`, () => {
            const invalidOption = invalidOptions[0];

            for (const [option, expectedValue] of validNonDefaultOptions) {
              context(
                `{ MONGODB_LOG_ALL: ${option}, ${componentSeverityOption}: ${option} }`,
                () => {
                  it(`sets ${componentSeverityOption} to the value of MONGODB_LOG_ALL`, () => {
                    const { componentSeverities } = MongoLogger.resolveOptions(
                      {
                        [loggingComponent]: invalidOption,
                        MONGODB_LOG_ALL: option
                      },
                      {}
                    );
                    expect(componentSeverities[componentSeverityOption]).to.equal(expectedValue);
                  });
                }
              );
            }
          });
        });

        context(`when ${loggingComponent} is set to a valid value in the environment`, () => {
          context(`when MONGODB_LOG_ALL is unset`, () => {
            for (const [option, expectedValue] of validNonDefaultOptions) {
              context(`{ ${loggingComponent}: ${option} }`, () => {
                it(`sets ${componentSeverityOption} to the value of ${loggingComponent}`, () => {
                  const { componentSeverities } = MongoLogger.resolveOptions(
                    {
                      [loggingComponent]: option
                    },
                    {}
                  );

                  expect(componentSeverities[componentSeverityOption]).to.equal(expectedValue);
                });
              });
            }
          });

          context(`when MONGODB_LOG_ALL is set to an invalid value`, () => {
            const invalidValue = invalidOptions[0];
            for (const [option, expectedValue] of validNonDefaultOptions) {
              context(
                `{ ${loggingComponent}: ${option}, MONGODB_LOG_ALL: ${invalidValue} }`,
                () => {
                  it(`sets ${componentSeverityOption} to the value of ${loggingComponent}`, () => {
                    const { componentSeverities } = MongoLogger.resolveOptions(
                      {
                        [loggingComponent]: option,
                        MONGODB_LOG_ALL: invalidValue
                      },
                      {}
                    );

                    expect(componentSeverities[componentSeverityOption]).to.equal(expectedValue);
                  });
                }
              );
            }
          });

          context(`when MONGODB_LOG_ALL is set to a valid value`, () => {
            const validOption = validNonDefaultOptions.keys()[0];
            for (const [option, expectedValue] of validNonDefaultOptions) {
              context(`{ ${loggingComponent}: ${option}, MONGODB_LOG_ALL: ${validOption} }`, () => {
                it(`sets ${componentSeverityOption} to the value of ${loggingComponent}`, () => {
                  const { componentSeverities } = MongoLogger.resolveOptions(
                    {
                      [loggingComponent]: option,
                      MONGODB_LOG_ALL: validOption
                    },
                    {}
                  );

                  expect(componentSeverities[componentSeverityOption]).to.equal(expectedValue);
                });
              });
            }
          });
        });
      }
    });

    context('maxDocumentLength', function () {
      const tests: Array<{
        input: undefined | string;
        expected: number;
        context: string;
        outcome: string;
      }> = [
        {
          input: undefined,
          expected: 1000,
          context: 'when unset',
          outcome: 'defaults to 1000'
        },
        {
          input: '33',
          context: 'when set to parsable uint',
          outcome: 'sets `maxDocumentLength` to the parsed value',
          expected: 33
        },
        {
          input: '',
          context: 'when set to an empty string',
          outcome: 'defaults to 1000',
          expected: 1000
        },
        {
          input: 'asdf',
          context: 'when set to a non-integer string',
          outcome: 'defaults to 1000',
          expected: 1000
        }
      ];

      for (const { input, outcome, expected, context: _context } of tests) {
        context(_context, () => {
          it(outcome, () => {
            const options = MongoLogger.resolveOptions(
              { MONGODB_LOG_MAX_DOCUMENT_LENGTH: input },
              {}
            );
            expect(options.maxDocumentLength).to.equal(expected);
          });
        });
      }
    });

    context('logDestination', function () {
      let stdoutStub;
      let stderrStub;
      let streamStub;
      let validOptions: Map<any, MongoDBLogWritable>;
      const stream: { write: (log: Log) => void; buffer: Log[] } = {
        write(log: Log): void {
          this.buffer.push(log);
        },
        buffer: []
      };
      const unsetOptions = ['', undefined];
      const invalidEnvironmentOptions = ['non-acceptable-string'];
      const invalidClientOptions = ['', '     ', undefined, null, 0, false, new Readable()];
      const validClientOptions = ['stderr', 'stdout', stream, 'stdErr', 'stdOut'];
      const validEnvironmentOptions = ['stderr', 'stdout', 'stdOut', 'stdErr'];

      beforeEach(function () {
        stdoutStub = sinon.stub(process.stdout);
        stderrStub = sinon.stub(process.stderr);
        streamStub = sinon.stub(stream);
        validOptions = new Map([
          ['stdout', stdoutStub],
          ['stderr', stderrStub],
          [stream, streamStub],
          ['stdOut', stdoutStub],
          ['stdErr', stderrStub]
        ] as Array<[any, MongoDBLogWritable]>);
      });

      afterEach(function () {
        sinon.restore();
      });

      context('when MONGODB_LOG_DESTINATION is unset in the environment', function () {
        context('when mongodbLogPath is unset as a client option', function () {
          for (const unsetEnvironmentOption of unsetOptions) {
            for (const unsetOption of unsetOptions) {
              it(`{environment: "${unsetEnvironmentOption}", client: "${unsetOption}"} defaults to process.stderr`, function () {
                const options = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_PATH: unsetEnvironmentOption,
                    MONGODB_LOG_COMMAND: 'emergency'
                  },
                  { mongodbLogPath: unsetOption as any }
                );
                const log: Log = { t: new Date(), c: 'command', s: 'emergency' };
                options.logDestination.write(log);

                expect(stderrStub.write).to.have.been.calledOnceWith(
                  inspect(log, { breakLength: Infinity, compact: true })
                );
              });
            }
          }
        });

        context('when mongodbLogPath is an invalid client option', function () {
          for (const unsetEnvironmentOption of unsetOptions) {
            for (const invalidOption of invalidClientOptions) {
              it(`{environment: "${unsetEnvironmentOption}", client: "${invalidOption}"} defaults to process.stderr`, function () {
                const options = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_PATH: unsetEnvironmentOption,
                    MONGODB_LOG_COMMAND: 'emergency'
                  },
                  { mongodbLogPath: invalidOption as any }
                );
                const log: Log = { t: new Date(), c: 'command', s: 'emergency' };
                options.logDestination.write(log);

                expect(stderrStub.write).to.have.been.calledOnceWith(
                  inspect(log, { breakLength: Infinity, compact: true })
                );
              });
            }
          }
        });

        context('when mongodbLogPath is a valid client option', function () {
          for (const unsetEnvironmentOption of unsetOptions) {
            for (const validOption of validClientOptions) {
              it(`{environment: "${unsetEnvironmentOption}", client: "${validOption}"} uses the value from the client options`, function () {
                const options = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_PATH: unsetEnvironmentOption,
                    MONGODB_LOG_COMMAND: 'emergency'
                  },
                  { mongodbLogPath: validOption as any }
                );

                const log: Log = { t: new Date(), c: 'command', s: 'emergency' };
                options.logDestination.write(log);
                const correctDestination = validOptions.get(validOption);
                expect(correctDestination?.write).to.have.been.calledOnce;
              });
            }
          }
        });
      });

      context(
        'when MONGODB_LOG_DESTINATION is set to an invalid value in the environment',
        function () {
          context('when mongodbLogPath is unset on the client options', function () {
            for (const invalidEnvironmentOption of invalidEnvironmentOptions) {
              for (const unsetClientOption of unsetOptions) {
                it(`{environment: "${invalidEnvironmentOption}", client: "${unsetClientOption}"} defaults to process.stderr`, function () {
                  const options = MongoLogger.resolveOptions(
                    {
                      MONGODB_LOG_PATH: invalidEnvironmentOption,
                      MONGODB_LOG_COMMAND: 'emergency'
                    },
                    { mongodbLogPath: unsetClientOption as any }
                  );
                  const log: Log = { t: new Date(), c: 'command', s: 'emergency' };
                  options.logDestination.write(log);

                  expect(stderrStub.write).to.have.been.calledOnceWith(
                    inspect(log, { breakLength: Infinity, compact: true })
                  );
                });
              }
            }
          });

          context(
            'when mongodbLogPath is set to an invalid value on the client options',
            function () {
              for (const invalidEnvironmentOption of invalidEnvironmentOptions) {
                for (const invalidOption of invalidClientOptions) {
                  it(`{environment: "${invalidEnvironmentOption}", client: "${invalidOption}"} defaults to process.stderr`, function () {
                    const options = MongoLogger.resolveOptions(
                      {
                        MONGODB_LOG_PATH: invalidEnvironmentOption,
                        MONGODB_LOG_COMMAND: 'emergency'
                      },
                      { mongodbLogPath: invalidOption as any }
                    );
                    const log: Log = { t: new Date(), c: 'command', s: 'emergency' };
                    options.logDestination.write(log);

                    expect(stderrStub.write).to.have.been.calledOnceWith(
                      inspect(log, { breakLength: Infinity, compact: true })
                    );
                  });
                }
              }
            }
          );

          context('when mongodbLogPath is set to a valid value on the client options', function () {
            for (const invalidEnvironmentOption of invalidEnvironmentOptions) {
              for (const validOption of validClientOptions) {
                it(`{environment: "${invalidEnvironmentOption}", client: "${validOption}"} uses the value from the client options`, function () {
                  const options = MongoLogger.resolveOptions(
                    {
                      MONGODB_LOG_PATH: invalidEnvironmentOption,
                      MONGODB_LOG_COMMAND: 'emergency'
                    },
                    { mongodbLogPath: validOption as any }
                  );
                  const correctDestination = validOptions.get(validOption);
                  const log: Log = { t: new Date(), c: 'command', s: 'emergency' };
                  options.logDestination.write(log);
                  expect(correctDestination?.write).to.have.been.calledOnce;
                });
              }
            }
          });
        }
      );

      context('when MONGODB_LOG_PATH is set to a valid option in the environment', function () {
        context('when mongodbLogPath is unset on the client options', function () {
          for (const validEnvironmentOption of validEnvironmentOptions) {
            for (const unsetOption of unsetOptions) {
              it(`{environment: "${validEnvironmentOption}", client: "${unsetOption}"} uses process.${validEnvironmentOption}`, function () {
                const options = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_PATH: validEnvironmentOption,
                    MONGODB_LOG_COMMAND: 'emergency'
                  },
                  { mongodbLogPath: unsetOption as any }
                );
                const correctDestination = validOptions.get(validEnvironmentOption);
                options.logDestination.write({ t: new Date(), c: 'command', s: 'emergency' });

                expect(correctDestination?.write).to.have.been.calledOnce;
              });
            }
          }
        });

        context(
          'when mongodbLogPath is set to an invalid value on the client options',
          function () {
            for (const validEnvironmentOption of validEnvironmentOptions) {
              for (const invalidValue of invalidClientOptions) {
                it(`{environment: "${validEnvironmentOption}", client: "${invalidValue}"} uses process.${validEnvironmentOption}`, function () {
                  const options = MongoLogger.resolveOptions(
                    {
                      MONGODB_LOG_PATH: validEnvironmentOption,
                      MONGODB_LOG_COMMAND: 'emergency'
                    },
                    { mongodbLogPath: invalidValue as any }
                  );

                  const correctDestination = validOptions.get(validEnvironmentOption);
                  const log: Log = { t: new Date(), c: 'command', s: 'emergency' };
                  options.logDestination.write(log);

                  expect(correctDestination?.write).to.have.been.calledOnce;
                });
              }
            }
          }
        );

        context('when mongodbLogPath is set to valid client option', function () {
          for (const validEnvironmentOption of validEnvironmentOptions) {
            for (const validValue of validClientOptions) {
              it(`{environment: "${validEnvironmentOption}", client: ${
                typeof validValue === 'object'
                  ? 'new ' + validValue.constructor.name + '(...)'
                  : '"' + validValue.toString() + '"'
              }} uses the value from the client options`, function () {
                const options = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_PATH: validEnvironmentOption,
                    MONGODB_LOG_COMMAND: 'emergency'
                  },
                  { mongodbLogPath: validValue as any }
                );
                const correctDestination = validOptions.get(validValue);
                options.logDestination.write({ t: new Date(), c: 'command', s: 'emergency' });
                expect(correctDestination?.write).to.have.been.calledOnce;
              });
            }
          }
        });
      });
    });
  });

  describe('severity helpers', function () {
    // TODO(NODE-4814): Ensure we test on all valid severity levels
    const severities = Object.values(SeverityLevel).filter(severity => severity === 'emergency');
    for (const severityLevel of severities) {
      describe(`${severityLevel}()`, function () {
        it('does not log when logging for the component is disabled', () => {
          const stream = new BufferingStream();
          const logger = new MongoLogger({
            componentSeverities: {
              topology: 'off'
            } as any,
            logDestination: stream
          } as any);

          logger[severityLevel]('topology', 'message');
          expect(stream.buffer).to.have.lengthOf(0);
        });

        // TODO(NODE-4814): Unskip this test
        context.skip('when the log severity is greater than what was configured', function () {
          it('does not write to logDestination', function () {
            const stream = new BufferingStream();
            const logger = new MongoLogger({
              componentSeverities: {
                command: severityLevel
              } as any,
              logDestination: stream
            } as any);

            const TRACE = 8;
            for (
              let l = SEVERITY_LEVEL_MAP.getNumericSeverityLevel(severityLevel) + 1;
              l <= TRACE;
              l++
            ) {
              const severity = SEVERITY_LEVEL_MAP.getSeverityLevelName(l);
              logger[severity as SeverityLevel]('command', 'Hello');
            }

            expect(stream.buffer).to.have.lengthOf(0);
          });
        });

        context('when log severity is equal to or less than what was configured', function () {
          it('writes log to logDestination', function () {
            const stream = new BufferingStream();
            const logger = new MongoLogger({
              componentSeverities: {
                command: severityLevel
              } as any,
              logDestination: stream
            } as any);

            const EMERGENCY = 0;
            // Calls all severity logging methods with a level less than or equal to what severityLevel
            for (
              let l = SEVERITY_LEVEL_MAP.getNumericSeverityLevel(severityLevel);
              l >= EMERGENCY;
              l--
            ) {
              const severity = SEVERITY_LEVEL_MAP.getSeverityLevelName(l);
              logger[severity as SeverityLevel]('command', 'Hello');
            }

            expect(stream.buffer).to.have.lengthOf(
              SEVERITY_LEVEL_MAP.getNumericSeverityLevel(severityLevel) + 1
            );
          });
        });

        context('when object with toLog method is being logged', function () {
          const obj = {
            a: 10,
            b: 12,
            toLog() {
              return { sum: this.a + this.b };
            }
          };
          it('calls toLog and constructs log message with the result of toLog', function () {
            const stream = new BufferingStream();
            const logger = new MongoLogger({
              componentSeverities: { command: severityLevel } as any,
              logDestination: stream
            } as any);

            logger[severityLevel]('command', obj);

            expect(stream.buffer).to.have.lengthOf(1);
            expect(stream.buffer[0]).to.have.property('sum', 22);
          });
        });

        context('when object without toLog method is being logged', function () {
          const obj = { a: 10, b: 12 };
          it('uses the existing fields to build the log message', function () {
            const stream = new BufferingStream();
            const logger = new MongoLogger({
              componentSeverities: { command: severityLevel } as any,
              logDestination: stream
            } as any);

            logger[severityLevel]('command', obj);
            expect(stream.buffer).to.have.lengthOf(1);
            expect(stream.buffer[0]).to.have.property('a', 10);
            expect(stream.buffer[0]).to.have.property('b', 12);
          });
        });

        context('when object with nullish top level fields is being logged', function () {
          const obj = {
            A: undefined,
            B: null,
            C: 'Hello World!'
          };
          it('emits a log message that omits the nullish top-level fields by default', function () {
            const stream = new BufferingStream();
            const logger = new MongoLogger({
              componentSeverities: { command: severityLevel } as any,
              logDestination: stream
            } as any);

            logger[severityLevel]('command', obj);

            expect(stream.buffer).to.have.lengthOf(1);
            expect(stream.buffer[0]).to.not.have.property('A');
            expect(stream.buffer[0]).to.not.have.property('B');
            expect(stream.buffer[0]).to.have.property('C', 'Hello World!');
          });
        });

        context('when string is being logged', function () {
          const message = 'Hello world';
          it('puts the string in the message field of the emitted log message', function () {
            const stream = new BufferingStream();
            const logger = new MongoLogger({
              componentSeverities: { command: severityLevel } as any,
              logDestination: stream
            } as any);

            logger[severityLevel]('command', message);
            expect(stream.buffer).to.have.lengthOf(1);
            expect(stream.buffer[0]).to.have.property('message', message);
          });
        });

        context('spec-required logs', function () {
          let stream: BufferingStream;
          let logger: MongoLogger;

          beforeEach(function () {
            stream = new BufferingStream();
            logger = new MongoLogger({
              componentSeverities: {
                command: 'trace',
                connection: 'trace'
              } as any,
              logDestination: stream
            } as any);
          });

          context('command component', function () {
            let log;
            const commandStarted = {
              commandName: 'find',
              requestId: 0,
              connectionId: 0,
              address: '127.0.0.1:27017',
              serviceId: new ObjectId(),
              databaseName: 'db',
              name: COMMAND_STARTED
            };
            const commandSucceeded = {
              commandName: 'find',
              requestId: 0,
              connectionId: 0,
              duration: 0,
              address: '127.0.0.1:27017',
              serviceId: new ObjectId(),
              databaseName: 'db',
              name: COMMAND_SUCCEEDED
            };
            const commandFailed = {
              commandName: 'find',
              requestId: 0,
              duration: 0,
              connectionId: 0,
              address: '127.0.0.1:27017',
              serviceId: new ObjectId(),
              databaseName: 'db',
              name: COMMAND_FAILED
            };

            function commonCommandComponentAssertions() {
              const fields = [
                ['commandName', 'string'],
                ['requestId', 'number'],
                ['driverConnectionId', 'number'],
                ['serverHost', 'string'],
                ['serverPort', 'number'],
                ['serviceId', 'string']
              ];
              for (const [fieldName, type] of fields) {
                it(`emits a log with field \`${fieldName}\` that is of type ${type}`, function () {
                  expect(log).to.have.property(fieldName).that.is.a(type);
                });
              }
            }

            context('when CommandStartedEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('command', commandStarted);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonCommandComponentAssertions();

              it('emits a log with field `message` = "Command started"', function () {
                expect(log).to.have.property('message', 'Command started');
              });

              it('emits a log with field `command` that is an EJSON string', function () {
                expect(log).to.have.property('command').that.is.a('string');
                expect(() => EJSON.parse(log.command)).to.not.throw();
              });

              it('emits a log with field `databaseName` that is a string', function () {
                expect(log).to.have.property('databaseName').that.is.a('string');
              });
            });

            context('when CommandSucceededEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('command', commandSucceeded);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0] as any;
              });

              commonCommandComponentAssertions();
              it('emits a log with field `message` = "Command succeeded"', function () {
                expect(log).to.have.property('message', 'Command succeeded');
              });

              it('emits a log with field `durationMS` that is a number', function () {
                expect(log).to.have.property('durationMS').that.is.a('number');
              });

              it('emits a log with field `reply` that is an EJSON string', function () {
                expect(log).to.have.property('reply').that.is.a('string');

                expect(() => EJSON.parse(log.reply)).to.not.throw();
              });
            });

            context('when CommandFailedEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('command', commandFailed);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0] as any;
              });

              commonCommandComponentAssertions();
              it('emits a log with field `message` = "Command failed"', function () {
                expect(log).to.have.property('message', 'Command failed');
              });

              it('emits a log with field `durationMS` that is a number', function () {
                expect(log).to.have.property('durationMS').that.is.a('number');
              });

              it('emits a log with field `failure`', function () {
                expect(log).to.have.property('failure');
              });
            });
          });

          context('connection component', function () {
            let log;
            const options = {
              maxIdleTimeMS: 0,
              minPoolSize: 0,
              maxPoolSize: 0,
              maxConnecting: 0,
              waitQueueTimeoutMS: 100
            };
            const connectionPoolCreated = {
              name: CONNECTION_POOL_CREATED,
              waitQueueSize: 0,
              address: '127.0.0.1:27017',
              options
            };
            const connectionPoolReady = {
              name: CONNECTION_POOL_READY,
              address: '127.0.0.1:27017',
              options
            };
            const connectionPoolCleared = {
              name: CONNECTION_POOL_CLEARED,
              serviceId: new ObjectId(),
              address: '127.0.0.1:27017',
              options
            };
            const connectionPoolClosed = {
              name: CONNECTION_POOL_CLOSED,
              address: '127.0.0.1:27017',
              options
            };
            const connectionCreated = {
              name: CONNECTION_CREATED,
              connectionId: 0,
              address: '127.0.0.1:27017',
              options
            };
            const connectionCheckOutStarted = {
              name: CONNECTION_CHECK_OUT_STARTED,
              address: '127.0.0.1:27017',
              options
            };
            const connectionCheckOutFailed = {
              name: CONNECTION_CHECK_OUT_FAILED,
              address: '127.0.0.1:27017',
              options
            };
            const connectionCheckedOut = {
              name: CONNECTION_CHECKED_OUT,
              connectionId: 0,
              address: '127.0.0.1:27017',
              options
            };
            const connectionCheckedIn = {
              name: CONNECTION_CHECKED_IN,
              connectionId: 0,
              address: '127.0.0.1:27017',
              options
            };
            const connectionReady = {
              name: CONNECTION_READY,
              connectionId: 0,
              address: '127.0.0.1:27017',
              options
            };
            const connectionClosed = {
              name: CONNECTION_CLOSED,
              connectionId: 0,
              address: '127.0.0.1:27017',
              options
            };
            function commonConnectionComponentAssertions() {
              const fields = [
                ['serverPort', 'number'],
                ['serverHost', 'string']
              ];
              for (const [fieldName, type] of fields) {
                it(`emits a log with field \`${fieldName}\` that is of type ${type}`, function () {
                  expect(log).to.have.property(fieldName).that.is.a(type);
                });
              }
            }

            context('when ConnectionPoolCreatedEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionPoolCreated);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });
              commonConnectionComponentAssertions();
              it('emits a log with field `message` = "Connection pool created"', function () {
                expect(log).to.have.property('message', 'Connection pool created');
              });
              it('emits a log with field `maxIdleTimeMS` that is a number', function () {
                expect(log).to.have.property('maxIdleTimeMS').that.is.a('number');
              });
              it('emits a log with field `minPoolSize` that is a number', function () {
                expect(log).to.have.property('minPoolSize').that.is.a('number');
              });
              it('emits a log with field `maxPoolSize` that is a number', function () {
                expect(log).to.have.property('maxPoolSize').that.is.a('number');
              });
              it('emits a log with field `maxConnecting` that is a number', function () {
                expect(log).to.have.property('maxConnecting').that.is.a('number');
              });
              it('emits a log with field `waitQueueTimeoutMS` that is a number', function () {
                expect(log).to.have.property('waitQueueTimeoutMS').that.is.a('number');
              });
            });

            context('when ConnectionPoolReadyEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionPoolReady);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonConnectionComponentAssertions();
              it('emits a log with field `message` = "Connection pool ready"', function () {
                expect(log).to.have.property('message', 'Connection pool ready');
              });
            });

            context('when ConnectionPoolClearedEvent is logged', function () {
              context('when serviceId is present', function () {
                beforeEach(function () {
                  logger[severityLevel]('connection', connectionPoolCleared);
                  expect(stream.buffer).to.have.lengthOf(1);
                  log = stream.buffer[0];
                });

                commonConnectionComponentAssertions();
                it('emits a log with field `message` = "Connection pool cleared"', function () {
                  expect(log).to.have.property('message', 'Connection pool cleared');
                });

                it('emits a log with field `serviceId` that is a string when it is present', function () {
                  expect(log).to.have.property('serviceId').that.is.a('string');
                });
              });

              context('when serviceId is not present', function () {
                beforeEach(function () {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { serviceId: _, ...connectionPoolClearedNoServiceId } =
                    connectionPoolCleared;
                  logger[severityLevel]('connection', connectionPoolClearedNoServiceId);
                  expect(stream.buffer).to.have.lengthOf(1);
                  log = stream.buffer[0];
                });

                commonConnectionComponentAssertions();
                it('emits a log with field `message` = "Connection pool cleared"', function () {
                  expect(log).to.have.property('message', 'Connection pool cleared');
                });

                it('emits a log without field `serviceId`', function () {
                  expect(log).to.not.have.property('serviceId');
                });
              });
            });

            context('when ConnectionPoolClosedEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionPoolClosed);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonConnectionComponentAssertions();
              it('emits a log with field `message` = "Connection pool closed"', function () {
                expect(log).to.have.property('message', 'Connection pool closed');
              });
            });

            context('when ConnectionCreatedEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionCreated);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonConnectionComponentAssertions();
              it('emits a log with field `message` = "Connection created"', function () {
                expect(log).to.have.property('message', 'Connection created');
              });
            });

            context('when ConnectionCheckOutStartedEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionCheckOutStarted);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonConnectionComponentAssertions();

              it('emits a log with field `message` = "Connection checkout started"', function () {
                expect(log).to.have.property('message', 'Connection checkout started');
              });
            });

            context('when ConnectionCheckOutFailedEvent is logged', function () {
              for (const [reason, message] of [
                ['connectionError', 'An error occurred while trying to establish a new connection'],
                ['timeout', 'Wait queue timeout elapsed without a connection becoming available'],
                ['poolClosed', 'Connection pool was closed']
              ]) {
                context(`with reason = "${reason}"`, function () {
                  beforeEach(function () {
                    const event =
                      reason === 'connectionError'
                        ? {
                            ...connectionCheckOutFailed,
                            reason,
                            error: new Error('this is an error')
                          }
                        : { ...connectionCheckOutFailed, reason };
                    logger[severityLevel]('connection', event);
                    expect(stream.buffer).to.have.lengthOf(1);
                    log = stream.buffer[0];
                  });
                  commonConnectionComponentAssertions();

                  it('emits a log with field `message` = "Connection checkout failed"', function () {
                    expect(log).to.have.property('message', 'Connection checkout failed');
                  });

                  it(`emits a log with field \`reason\` = "${message}"`, function () {
                    expect(log).to.have.property('reason', message);
                  });

                  if (reason === 'connectionError') {
                    it('emits a log with field `error`', function () {
                      expect(log).to.have.property('error').that.is.instanceOf(Error);
                    });
                  }
                });
              }
            });

            context('when ConnectionCheckedInEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionCheckedIn);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonConnectionComponentAssertions();
              it('emits a log with field `message` = "Connection checked in"', function () {
                expect(log).to.have.property('message', 'Connection checked in');
              });
            });

            context('when ConnectionCheckedOutEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionCheckedOut);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonConnectionComponentAssertions();
              it('emits a log with field `message` = "Connection checked out"', function () {
                expect(log).to.have.property('message', 'Connection checked out');
              });
            });

            context('when ConnectionReadyEvent is logged', function () {
              beforeEach(function () {
                logger[severityLevel]('connection', connectionReady);
                expect(stream.buffer).to.have.lengthOf(1);
                log = stream.buffer[0];
              });

              commonConnectionComponentAssertions();
              it('emits a log with field `message` = "Connection checked out"', function () {
                expect(log).to.have.property('message', 'Connection ready');
              });
            });

            context('when ConnectionClosedEvent is logged', function () {
              for (const [reason, message] of [
                ['error', 'An error occurred while using the connection'],
                [
                  'idle',
                  'Connection has been available but unused for longer than the configured max idle time'
                ],
                ['stale', 'Connection became stale because the pool was cleared'],
                ['poolClosed', 'Connection pool was closed']
              ]) {
                context(`with reason = "${reason}"`, function () {
                  beforeEach(function () {
                    const event =
                      reason === 'error'
                        ? { ...connectionClosed, reason, error: new Error('this is an error') }
                        : { ...connectionClosed, reason };
                    logger[severityLevel]('connection', event);
                    expect(stream.buffer).to.have.lengthOf(1);
                    log = stream.buffer[0];
                  });

                  commonConnectionComponentAssertions();
                  it(`emits a log with field \`reason\` = "${message}"`, function () {
                    expect(log).to.have.property('reason', message);
                  });

                  if (reason === 'error') {
                    it('emits a log with field `error`', function () {
                      expect(log).to.have.property('error');
                    });
                  }
                });
              }

              context('with unknown reason', function () {
                beforeEach(function () {
                  logger[severityLevel]('connection', { ...connectionClosed, reason: 'woops' });
                  expect(stream.buffer).to.have.lengthOf(1);
                  log = stream.buffer[0];
                });

                commonConnectionComponentAssertions();
                it('emits a log with field `reason` prefixed by "Unknown close reason: "', function () {
                  expect(log).to.have.property('reason');
                  expect(log.reason).to.match(/^Unknown close reason: .*$/);
                });
              });
            });
          });
        });
      });
    }
  });

  describe('stringifyWithMaxLen', function () {
    const largeDoc = {};
    const smallDoc = { test: 'Hello' };
    before(function () {
      for (let i = 0; i < DEFAULT_MAX_DOCUMENT_LENGTH; i++) {
        largeDoc[`test${i}`] = `Hello_${i}`;
      }
    });

    context('when maxDocumentLength = 0', function () {
      it('does not truncate document', function () {
        expect(stringifyWithMaxLen(largeDoc, 0)).to.equal(EJSON.stringify(largeDoc));
      });
    });

    context('when maxDocumentLength is non-zero', function () {
      context('when document has length greater than maxDocumentLength', function () {
        it('truncates ejson string to length of maxDocumentLength + 3', function () {
          expect(stringifyWithMaxLen(largeDoc, DEFAULT_MAX_DOCUMENT_LENGTH)).to.have.lengthOf(
            DEFAULT_MAX_DOCUMENT_LENGTH + 3
          );
        });
        it('ends with "..."', function () {
          expect(stringifyWithMaxLen(largeDoc, DEFAULT_MAX_DOCUMENT_LENGTH)).to.match(/^.*\.\.\.$/);
        });
      });

      context('when document has length less than or equal to maxDocumentLength', function () {
        it('does not truncate document', function () {
          expect(stringifyWithMaxLen(smallDoc, DEFAULT_MAX_DOCUMENT_LENGTH)).to.equal(
            EJSON.stringify(smallDoc)
          );
        });
        it('does not end with "..."', function () {
          expect(stringifyWithMaxLen(smallDoc, DEFAULT_MAX_DOCUMENT_LENGTH)).to.not.match(
            /^.*\.\.\./
          );
        });

        it('produces valid relaxed EJSON', function () {
          expect(() => {
            EJSON.parse(stringifyWithMaxLen(smallDoc, DEFAULT_MAX_DOCUMENT_LENGTH));
          }).to.not.throw();
        });
      });
    });
  });
});
