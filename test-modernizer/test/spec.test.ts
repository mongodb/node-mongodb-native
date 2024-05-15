import { createProjectSync } from '@ts-morph/bootstrap';
import { expect } from 'chai';
import { readFileSync, writeFileSync } from 'fs';
import { describe } from 'mocha';
import { resolve } from 'path';
import ts from 'typescript';
import { inspect } from 'util';

import {
  convert,
  convertTest,
  type DriverAPI,
  DriverAPICallbackNode,
  isDriverAPI,
  isMochaTest,
  MochaTest,
  type MochaTestFunction
} from '../src/driver';
import { explore, formatSource } from '../src/utils';

function parseSource(source: string) {
  const project = createProjectSync();
  const resultFile = project.createSourceFile('someFileName.ts', source);
  return resultFile;
}
describe('Specification Tests', function () {
  const tests = [
    {
      description: 'basic',
      input: `collection.insertMany({}, () => {})`,
      output: `await collection.insertMany({});`
    },
    {
      description: 'only error',
      input: `collection.insertMany({}, (error) => {
            console.log(error);
          })`,
      output: `{ var error;
    try {
      await collection.insertMany({});
    } catch (_err) {
      error = _err;
    }
    console.log(error);
  }
    `
    },
    {
      description: 'both',
      input: `collection.insertMany((err, result) => {
            console.log(err);
            console.log(result);
          })`,
      output: `
    {
      var err;
    var result;
    try {
      result = await collection.insertMany();
    } catch (_err) {
      err = _err;
    }
    console.log(err);
    console.log(result);
  }
    `
    }
  ];

  for (const test of tests) {
    it(test.description, async function () {
      // const input = parseSource(test.input);
      // const result = convert(input);
      // const res = await formatSource(result);
      // const expected = await formatSource(test.output);
      // expect(res.trim()).to.deep.equal(expected.trim());
    });
  }

  describe('class MochaTest', () => {
    const testWithoutCallback = `
    it('runs', function () {
      expect(true).to.be.true;
    });
    `;

    const testWithCallback = `
    it('runs', function (done) {
      expect(true).to.be.true;
      done();
    });
    `;
    function setup(testSourceString: string = testWithoutCallback) {
      const source = parseSource(testSourceString);

      const output: MochaTestFunction[] = [];
      (function extractMochaTest(node: ts.Node, output: MochaTestFunction[]) {
        if (isMochaTest(node)) {
          output.push(node);
          return;
        }
        node.forEachChild(node => extractMochaTest(node, output));
      })(source, output);
      return output[0];
    }

    it('constructs fine', function () {
      const test = new MochaTest(setup());

      expect(test).to.be.instanceOf(MochaTest);
    });

    it('throws if constructed with a non-mocha test function', function () {
      expect(() => new MochaTest(ts.factory.createIdentifier('foo') as any)).to.throw;
    });

    it('.testFunction returns the test body (callback function)', function () {
      const test = new MochaTest(setup());
      const function_ = test.testFunction;

      expect(ts.isFunctionExpression(function_)).to.be.true;
    });

    it('.isCallbackTest returns true when there is a `done` param provided to the test', function () {
      const test = new MochaTest(setup(testWithCallback));
      expect(test.isCallbackTest).to.be.true;
    });

    it('.isCallbackTest returns false when there is NOT a `done` param provided to the test', function () {
      const test = new MochaTest(setup(testWithoutCallback));
      expect(test.isCallbackTest).to.be.false;
    });

    it('custom inspect produces an output', function () {
      const test = new MochaTest(setup(testWithoutCallback));
      const output = inspect(test);
      expect(output).to.be.a('string').with.length.greaterThan(0);
    });

    it('.testBody returns the test body', function () {
      const test = new MochaTest(setup(testWithoutCallback));
      expect(ts.isBlock(test.testBody)).to.be.true;
    });
  });

  describe('DriverAPINode', function () {
    const testWithCallback = `collection.insertOne({}, (err) => {});`;
    function setup(testSourceString: string = testWithCallback) {
      const source = parseSource(testSourceString);

      const output: DriverAPI[] = [];
      (function extractMochaTest(node: ts.Node, output: DriverAPI[]) {
        if (isDriverAPI(node)) {
          output.push(node);
          return;
        }
        node.forEachChild(node => extractMochaTest(node, output));
      })(source, output);
      return output[0];
    }

    it('throws when constructed with a non-driver api node', function () {
      expect(() => new DriverAPICallbackNode(parseSource('foo.bar()') as any));
    });

    it('constructs successfully when constructed with a DriverAPI', function () {
      const test = new DriverAPICallbackNode(setup());
      expect(test).to.be.instanceOf(DriverAPICallbackNode);
      expect(test.usesCallback).to.be.true;
      expect(ts.isBlock(test.callbackBody));
    });

    it('throws when constructed without a callback', function () {
      expect(() => new DriverAPICallbackNode(setup('collection.insertOne({})')));
    });

    it('throws when constructed with a callback that uses destructuring', function () {
      expect(
        () => new DriverAPICallbackNode(setup(`collection.insertOne({}, ({ name }, result) => {})`))
      );

      expect(
        () => new DriverAPICallbackNode(setup(`collection.insertOne({}, (err, { value }) => {})`))
      );
    });

    it('converts arrow function expressions to statement bodies', function () {
      const test = new DriverAPICallbackNode(setup('collection.insertOne({}, () =>  3 + 3)'));
      expect(ts.isBlock(test.callbackBody));
    });

    it('.parameterLength returns the number of callback parameters', function () {
      expect(
        new DriverAPICallbackNode(setup('collection.insertOne({}, () =>  3 + 3)')).parameterLength
      ).to.equal(0);
      expect(
        new DriverAPICallbackNode(setup('collection.insertOne({}, (err) =>  3 + 3)'))
          .parameterLength
      ).to.equal(1);
      expect(
        new DriverAPICallbackNode(setup('collection.insertOne({}, (err, result) =>  3 + 3)'))
          .parameterLength
      ).to.equal(2);
    });

    it('.errorParameter is correctly set, when defined', function () {
      expect(
        new DriverAPICallbackNode(setup('collection.insertOne({}, () =>  3 + 3)')).errorParameter
      ).to.be.null;
      const parameter = new DriverAPICallbackNode(
        setup('collection.insertOne({}, (err) =>  3 + 3)')
      ).errorParameter;
      expect(ts.isIdentifier(parameter)).to.be.true;
      expect(parameter.escapedText).to.equal('err');
    });

    it('.errorParameter is correctly set, when defined', function () {
      expect(
        new DriverAPICallbackNode(setup('collection.insertOne({}, () =>  3 + 3)')).resultParameter
      ).to.be.null;
      expect(
        new DriverAPICallbackNode(setup('collection.insertOne({}, (err) =>  3 + 3)'))
          .resultParameter
      ).to.be.null;
      const parameter = new DriverAPICallbackNode(
        setup('collection.insertOne({}, (err, result) =>  3 + 3)')
      ).resultParameter;
      expect(ts.isIdentifier(parameter)).to.be.true;
      expect(parameter.escapedText).to.equal('result');
    });
  });

  describe('convert(MochaTest)', function () {
    function setup(testSourceString: string) {
      const source = parseSource(testSourceString);

      const output: MochaTest[] = [];
      (function extractMochaTest(node: ts.Node, output: MochaTest[]) {
        if (isMochaTest(node)) {
          output.push(new MochaTest(node));
          return;
        }
        node.forEachChild(node => extractMochaTest(node, output));
      })(source, output);
      return [output[0], source] as const;
    }

    it('does nothing to an empty test', async function () {
      const test = setup(`it('does nothing', function () { })`);
      convertTest(test[0]);

      const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

      const expected = await formatSource(`it('does nothing', function () { })`);
      expect(resultAsString).to.deep.equal(expected);
    });

    it('does nothing to synchronous tests', async function () {
      const test = setup(`it('does nothing', function () {
        expect(true).to.be.true;
      })`);
      convertTest(test[0]);

      const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

      const expected = await formatSource(`it('does nothing', function () {
        expect(true).to.be.true;
      })`);
      expect(resultAsString).to.deep.equal(expected);
    });

    it('does nothing to async tests', async function () {
      const test = setup(`it('does nothing', async function () {
        expect(true).to.be.true;
      })`);
      convertTest(test[0]);

      const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

      const expected = await formatSource(`it('does nothing', async function () {
        expect(true).to.be.true;
      })`);
      expect(resultAsString).to.deep.equal(expected);
    });

    it('does nothing to async callback tests with no driver API', async function () {
      const test = setup(`it('does nothing', function (done) {
        expect(true).to.be.true;
      })`);
      convertTest(test[0]);

      const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

      const expected = await formatSource(`it('does nothing', function (done) {
        expect(true).to.be.true;
      })`);
      expect(resultAsString).to.deep.equal(expected);
    });

    describe('nodes to convert', function () {
      it('single driver callback API, no callback parameters', async function () {
        const test = setup(`it('does nothing', function (done) {
          collection.find({}).toArray(() => { done() })
        })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
          await collection.find({}).toArray();
        })`);
        expect(resultAsString).to.deep.equal(expected);
      });

      it('single driver callback API, error parameters', async function () {
        const test = setup(`it('does nothing', function (done) {
          collection.find({}).toArray((err) => {
            if (err) console.log('ahhh');
            done()
          });
        })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
          var err;
          try {
            await collection.find({}).toArray();
          } catch (_error_unique) {
            err = _error_unique;
          }
          if (err) console.log('ahhh');
        })`);
        expect(resultAsString).to.deep.equal(expected);
      });

      it('single driver callback API, both parameters', async function () {
        const test = setup(`it('does nothing', function (done) {
          collection.find({}).toArray((err, result) => {
            if (err) console.log('ahhh');
            expect(Array.isArray(result)).to.be.true;
            done();
          });
        })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
          var err;
          var result;
          try {
            result = await collection.find({}).toArray();
          } catch (_error_unique) {
            err = _error_unique;
          }
          if (err) console.log('ahhh');
          expect(Array.isArray(result)).to.be.true;
        })`);
        expect(resultAsString).to.deep.equal(expected);
      });

      it('single driver callback API, both parameters with additional statements', async function () {
        const test = setup(`it('does nothing', function (done) {
          const client = this.configuration.newClient();
          const collection = collection.db('foo').collection('bar');
          collection.find({}).toArray((err, result) => {
            if (err) console.log('ahhh');
            expect(Array.isArray(result)).to.be.true;
            done();
          });
        })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
          const client = this.configuration.newClient();
          const collection = collection.db('foo').collection('bar');
          var err;
          var result;
          try {
            result = await collection.find({}).toArray();
          } catch (_error_unique) {
            err = _error_unique;
          }
          if (err) console.log('ahhh');
          expect(Array.isArray(result)).to.be.true;
        })`);
        expect(resultAsString).to.deep.equal(expected);
      });

      it('two driver apis, no callback parameters', async function () {
        const test = setup(`it('does nothing', function (done) {
          const client = this.configuration.newClient();
          client.connect(() => {
            const collection = collection.db('foo').collection('bar');
            collection.find({}).toArray(() => {
              done();
            });
          })
        })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
          const client = this.configuration.newClient();
          await client.connect();
          const collection = collection.db('foo').collection('bar');
          await collection.find({}).toArray();
        })`);
        expect(resultAsString).to.deep.equal(expected);
      });

      it('two driver apis, error parameters', async function () {
        const test = setup(`it('does nothing', function (done) {
          const client = this.configuration.newClient();
          client.connect((error) => {
            expect(error).not.to.exist;
            const collection = collection.db('foo').collection('bar');
            collection.find({}).toArray((error) => {
              expect(error).not.to.exist;
              done();
            });
          })
        })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
          const client = this.configuration.newClient();
          var error;
          try {
            await client.connect();
          } catch (_error_unique) {
            error = _error_unique;
          }
          expect(error).not.to.exist;
          const collection = collection.db('foo').collection('bar');
          var error;
          try {
            await collection.find({}).toArray();
          } catch (_error_unique) {
            error = _error_unique;
          }
          expect(error).not.to.exist;
        })`);
        expect(resultAsString).to.deep.equal(expected);
      });

      it('two driver apis, multiple parameters', async function () {
        const test = setup(`it('does nothing', function (done) {
          const client = this.configuration.newClient();
          client.connect((error) => {
            expect(error).not.to.exist;
            const collection = collection.db('foo').collection('bar');
            collection.find({}).toArray((error, documents) => {
              expect(error).not.to.exist;
              expect(documents).to.be.an('array');
              done();
            });
          })
        })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
          const client = this.configuration.newClient();
          var error;
          try {
            await client.connect();
          } catch (_error_unique) {
            error = _error_unique;
          }
          expect(error).not.to.exist;
          const collection = collection.db('foo').collection('bar');
          var error;
          var documents;
          try {
            documents = await collection.find({}).toArray();
          } catch (_error_unique) {
            error = _error_unique;
          }
          expect(error).not.to.exist;
          expect(documents).to.be.an('array');
        })`);
        expect(resultAsString).to.deep.equal(expected);
      });

      it('whole bunch of nested callbacks', async function () {
        const test = setup(`it('does nothing', function (done) {
    const client = this.configuration.newClient();
    client.connect((error) => {
      expect(error).not.to.exist;
      const collection = collection.db('foo').collection('bar');
      collection.find({}).toArray((error, documents) => {
        expect(error).not.to.exist;
        expect(documents).to.be.an('array');
        collection.find({}).toArray((error, documents) => {
          expect(error).not.to.exist;
          expect(documents).to.be.an('array');
          collection.find({}).toArray((error, documents) => {
            expect(error).not.to.exist;
            expect(documents).to.be.an('array');
            done();
          });
        });
      });
    })
  })`);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
    const client = this.configuration.newClient();
    var error;
    try {
      await client.connect();
    } catch (_error_unique) {
      error = _error_unique;
    }
    expect(error).not.to.exist;
    const collection = collection.db('foo').collection('bar');
    var error;
    var documents;
    try {
      documents = await collection.find({}).toArray();
    } catch (_error_unique) {
      error = _error_unique;
    }
    expect(error).not.to.exist;
    expect(documents).to.be.an('array');
    var error;
    var documents;
    try {
      documents = await collection.find({}).toArray();
    } catch (_error_unique) {
      error = _error_unique;
    }
    expect(error).not.to.exist;
    expect(documents).to.be.an('array');
    var error;
    var documents;
    try {
      documents = await collection.find({}).toArray();
    } catch (_error_unique) {
      error = _error_unique;
    }
    expect(error).not.to.exist;
    expect(documents).to.be.an('array');
  })`);
        expect(resultAsString).to.deep.equal(expected);
      });
    });

    describe('custom metadata + runner object tests', function () {
      it.skip('correctly converts test + metadata format', async function () {
        const test = setup(`it('works with custom format', { metadata: {},
          test: function(done) {
            expect(true).to.be.true;
            done();
          }
        )`);
        explore(test[1]);
        convertTest(test[0]);

        const resultAsString = await formatSource(test[1], ts.EmitHint.SourceFile);

        const expected = await formatSource(`it('does nothing', async function () {
      const client = this.configuration.newClient();
      var error;
      try {
        await client.connect();
      } catch (_error_unique) {
        error = _error_unique;
      }
      expect(error).not.to.exist;
      const collection = collection.db('foo').collection('bar');
      var error;
      var documents;
      try {
        documents = await collection.find({}).toArray();
      } catch (_error_unique) {
        error = _error_unique;
      }
      expect(error).not.to.exist;
      expect(documents).to.be.an('array');
    })`);
        expect(resultAsString).to.deep.equal(expected);
      });
    });
  });

  describe('full test file', function () {
    it('does nothing if there is no mocha group', async function () {
      const test = parseSource(`3 + 3`);
      convert(test);

      const resultAsString = await formatSource(test, ts.EmitHint.SourceFile);

      const expected = await formatSource(`3 + 3`);
      expect(resultAsString).to.deep.equal(expected);
    });

    it('does nothing if there is no mocha test function', async function () {
      const test = parseSource(`describe('mocha tests', function() { })`);
      convert(test);

      const resultAsString = await formatSource(test, ts.EmitHint.SourceFile);

      const expected = await formatSource(`describe('mocha tests', function() { })`);
      expect(resultAsString).to.deep.equal(expected);
    });

    it('converts a test  file', async function () {
      const test = parseSource(
        `describe('mocha tests', function() {
  it('does nothing', function (done) {
    collection.find({}).toArray((err, result) => {
      if (err) console.log('ahhh');
      expect(Array.isArray(result)).to.be.true;
      done();
    });
  })
})`
      );
      convert(test);

      const resultAsString = await formatSource(test, ts.EmitHint.SourceFile);

      const expected = await formatSource(
        `describe('mocha tests', function() {
  it('does nothing', async function () {
    var err;
    var result;
    try {
      result = await collection.find({}).toArray();
    } catch (_error_unique) {
      err = _error_unique;
    }
    if (err) console.log('ahhh');
    expect(Array.isArray(result)).to.be.true;
  })
})`
      );
      expect(resultAsString).to.deep.equal(expected);
    });

    it.skip('converts a test  file', async function () {
      const test = parseSource(readFileSync(resolve(__dirname, '../../test/find.test'), 'utf-8'));
      convert(test);

      const resultAsString = await formatSource(test, ts.EmitHint.SourceFile);

      writeFileSync('out.js', resultAsString);
    });
  });
});
