import { expect } from 'chai';
import { Readable, Writable } from 'stream';

import { MongoLogger, MongoLoggerOptions, SeverityLevel } from '../mongodb';

class BufferingStream extends Writable {
  buffer: string[] = [];

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
            context(`{ MONGODB_LOG_ALL: '${validOption} }'`, () => {
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
      const stream = new Writable();
      const validOptions: Map<any, Writable> = new Map([
        ['stdout', process.stdout],
        ['stderr', process.stderr],
        [stream, stream],
        ['stdOut', process.stdout],
        ['stdErr', process.stderr]
      ] as Array<[any, Writable]>);
      const unsetOptions = ['', undefined];
      const invalidEnvironmentOptions = ['non-acceptable-string'];
      const invalidClientOptions = ['', '     ', undefined, null, 0, false, new Readable()];
      const validClientOptions = ['stderr', 'stdout', stream, 'stdErr', 'stdOut'];
      const validEnvironmentOptions = ['stderr', 'stdout', 'stdOut', 'stdErr'];
      context('when MONGODB_LOG_DESTINATION is unset in the environment', function () {
        context('when mongodbLogPath is unset as a client option', function () {
          for (const unsetEnvironmentOption of unsetOptions) {
            for (const unsetOption of unsetOptions) {
              it(`{environment: "${unsetEnvironmentOption}", client: "${unsetOption}"} defaults to process.stderr`, function () {
                const options = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_PATH: unsetEnvironmentOption
                  },
                  { mongodbLogPath: unsetOption as any }
                );
                expect(options.logDestination).to.equal(process.stderr);
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
                    MONGODB_LOG_PATH: unsetEnvironmentOption
                  },
                  { mongodbLogPath: invalidOption as any }
                );
                expect(options.logDestination).to.equal(process.stderr);
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
                    MONGODB_LOG_PATH: unsetEnvironmentOption
                  },
                  { mongodbLogPath: validOption as any }
                );
                const correctDestination = validOptions.get(validOption);
                expect(options.logDestination).to.equal(correctDestination);
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
                      MONGODB_LOG_PATH: invalidEnvironmentOption
                    },
                    { mongodbLogPath: unsetClientOption as any }
                  );
                  expect(options.logDestination).to.equal(process.stderr);
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
                        MONGODB_LOG_PATH: invalidEnvironmentOption
                      },
                      { mongodbLogPath: invalidOption as any }
                    );
                    expect(options.logDestination).to.equal(process.stderr);
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
                      MONGODB_LOG_PATH: invalidEnvironmentOption
                    },
                    { mongodbLogPath: validOption as any }
                  );
                  const correctDestination = validOptions.get(validOption);
                  expect(options.logDestination).to.equal(correctDestination);
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
                    MONGODB_LOG_PATH: validEnvironmentOption
                  },
                  { mongodbLogPath: unsetOption as any }
                );
                const correctDestination = validOptions.get(validEnvironmentOption);
                expect(options.logDestination).to.equal(correctDestination);
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
                      MONGODB_LOG_PATH: validEnvironmentOption
                    },
                    { mongodbLogPath: invalidValue as any }
                  );
                  const correctDestination = validOptions.get(validEnvironmentOption);
                  expect(options.logDestination).to.equal(correctDestination);
                });
              }
            }
          }
        );

        context('when mongodbLogPath is set to valid client option', function () {
          for (const validEnvironmentOption of validEnvironmentOptions) {
            for (const validValue of validClientOptions) {
              it(`{environment: "${validEnvironmentOption}", client: "${validValue}"} uses the value from the client options`, function () {
                const options = MongoLogger.resolveOptions(
                  {
                    MONGODB_LOG_PATH: validEnvironmentOption
                  },
                  { mongodbLogPath: validValue as any }
                );
                const correctDestination = validOptions.get(validValue);
                expect(options.logDestination).to.equal(correctDestination);
              });
            }
          }
        });
      });
    });
  });

  describe('severity helpers', function () {
    const severities = Object.values(SeverityLevel).filter(severity => severity !== 'off');
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
      });
    }
  });
});
