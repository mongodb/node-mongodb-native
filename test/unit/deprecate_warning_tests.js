'use strict';
const deprecateOptions = require('../../lib/utils').deprecateOptions;
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
require('mocha-sinon');
chai.use(sinonChai);

const makeTestFunction = require('../tools/utils').makeTestFunction;
const ensureCalledWith = require('../tools/utils').ensureCalledWith;

describe('Deprecation Warnings', function() {
  let messages = [];
  const deprecatedOptions = ['maxScan', 'snapshot', 'fields'];
  const defaultMessage = ' is deprecated and will be removed in a later version.';

  before(function() {
    if (process.emitWarning) {
      process.on('warning', warning => {
        messages.push(warning.message);
      });
    }
    return;
  });

  beforeEach(function() {
    this.sinon.stub(console, 'error');
  });

  afterEach(function() {
    messages.length = 0;
  });

  describe('Mult functions with same options', function() {
    beforeEach(function() {
      const f1 = makeTestFunction({
        name: 'f1',
        deprecatedOptions: deprecatedOptions,
        optionsIndex: 0
      });
      const f2 = makeTestFunction({
        name: 'f2',
        deprecatedOptions: deprecatedOptions,
        optionsIndex: 0
      });
      f1({ maxScan: 5 });
      f2({ maxScan: 5 });
    });

    it('multiple functions with the same deprecated options should both warn', {
      metadata: { requires: { node: '>=6.0.0' } },
      test: function(done) {
        process.nextTick(() => {
          expect(messages).to.deep.equal([
            'f1 option [maxScan]' + defaultMessage,
            'f2 option [maxScan]' + defaultMessage
          ]);
          expect(messages).to.have.a.lengthOf(2);
          done();
        });
      }
    });

    it('multiple functions with the same deprecated options should both warn', {
      metadata: { requires: { node: '<6.0.0' } },
      test: function(done) {
        ensureCalledWith(console.error, [
          'f1 option [maxScan]' + defaultMessage,
          'f2 option [maxScan]' + defaultMessage
        ]);
        expect(console.error).to.have.been.calledTwice;
        done();
      }
    });
  });

  describe('Empty options object', function() {
    beforeEach(function() {
      const f = makeTestFunction({
        name: 'f',
        deprecatedOptions: deprecatedOptions,
        optionsIndex: 0
      });
      f({});
    });

    it('should not warn if empty options object passed in', {
      metadata: { requires: { node: '>=6.0.0' } },
      test: function(done) {
        process.nextTick(() => {
          expect(messages).to.have.a.lengthOf(0);
          done();
        });
      }
    });

    it('should not warn if empty options object passed in', {
      metadata: { requires: { node: '<6.0.0' } },
      test: function(done) {
        expect(console.error).to.have.not.been.called;
        done();
      }
    });
  });

  describe('Custom Message Handler', function() {
    beforeEach(function() {
      const customMsgHandler = (name, option) => {
        return 'custom msg for function ' + name + ' and option ' + option;
      };

      const f = makeTestFunction({
        name: 'f',
        deprecatedOptions: deprecatedOptions,
        optionsIndex: 0,
        msgHandler: customMsgHandler
      });

      f({ maxScan: 5, snapshot: true, fields: 'hi' });
    });

    it('should use user-specified message handler', {
      metadata: { requires: { node: '>=6.0.0' } },
      test: function(done) {
        process.nextTick(() => {
          expect(messages).to.deep.equal([
            'custom msg for function f and option maxScan',
            'custom msg for function f and option snapshot',
            'custom msg for function f and option fields'
          ]);
          expect(messages).to.have.a.lengthOf(3);
          done();
        });
      }
    });

    it('should use user-specified message handler', {
      metadata: { requires: { node: '<6.0.0' } },
      test: function(done) {
        ensureCalledWith(console.error, [
          'custom msg for function f and option maxScan',
          'custom msg for function f and option snapshot',
          'custom msg for function f and option fields'
        ]);
        expect(console.error).to.have.been.calledThrice;
        done();
      }
    });
  });

  describe('Warn once', function() {
    beforeEach(function() {
      const f = makeTestFunction({
        name: 'f',
        deprecatedOptions: deprecatedOptions,
        optionsIndex: 0
      });
      f({ maxScan: 5, fields: 'hi' });
      f({ maxScan: 5, fields: 'hi' });
    });

    it('each function should only warn once per deprecated option', {
      metadata: { requires: { node: '>=6.0.0' } },
      test: function(done) {
        process.nextTick(() => {
          expect(messages).to.deep.equal([
            'f option [maxScan]' + defaultMessage,
            'f option [fields]' + defaultMessage
          ]);
          expect(messages).to.have.a.lengthOf(2);
          done();
        });
      }
    });

    it('each function should only warn once per deprecated option', {
      metadata: { requires: { node: '<6.0.0' } },
      test: function(done) {
        ensureCalledWith(console.error, [
          'f option [maxScan]' + defaultMessage,
          'f option [fields]' + defaultMessage
        ]);
        expect(console.error).to.have.been.calledTwice;
        done();
      }
    });
  });

  describe('Maintain functionality', function() {
    beforeEach(function() {
      const config = {
        name: 'f',
        deprecatedOptions: ['multiply', 'add'],
        optionsIndex: 0
      };

      const operateBy2 = (options, num) => {
        if (options.multiply === true) {
          return num * 2;
        }
        if (options.add === true) {
          return num + 2;
        }
      };

      const f = deprecateOptions(config, operateBy2);

      const mult = f({ multiply: true }, 5);
      const add = f({ add: true }, 5);

      expect(mult).to.equal(10);
      expect(add).to.equal(7);
    });

    it('wrapped functions should maintain original functionality', {
      metadata: { requires: { node: '>=6.0.0' } },
      test: function(done) {
        process.nextTick(() => {
          expect(messages).to.deep.equal([
            'f option [multiply]' + defaultMessage,
            'f option [add]' + defaultMessage
          ]);
          expect(messages).to.have.a.lengthOf(2);
          done();
        });
      }
    });

    it('wrapped functions should maintain original functionality', {
      metadata: { requires: { node: '<6.0.0' } },
      test: function(done) {
        ensureCalledWith(console.error, [
          'f option [multiply]' + defaultMessage,
          'f option [add]' + defaultMessage
        ]);
        expect(console.error).to.have.been.calledTwice;
        done();
      }
    });
  });

  it('optionsIndex pointing to undefined should not error', function(done) {
    const f = makeTestFunction({
      name: 'f',
      deprecatedOptions: deprecatedOptions,
      optionsIndex: 0
    });
    expect(f).to.not.throw();
    done();
  });

  it('optionsIndex not pointing to object should not error', function(done) {
    const f = makeTestFunction({
      name: 'f',
      deprecatedOptions: deprecatedOptions,
      optionsIndex: 0
    });
    expect(() => f('not-an-object')).to.not.throw();
    done();
  });
});
