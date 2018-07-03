'use strict';
const deprecateOptions = require('../../lib/utils').deprecateOptions;
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
require('mocha-sinon');
chai.use(sinonChai);

function makeTestFunction(config) {
  const fn = options => {
    if (options) options = null;
  };
  return deprecateOptions(config, fn);
}

function ensureCalledWith(args) {
  args.forEach(m => expect(console.error).to.have.been.calledWith(m));
}

describe('Deprecation Warnings', function() {
  let messages = [];
  const deprecatedParams = ['maxScan', 'snapshot', 'fields'];
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

  function setupMultFunctionswithSameParams() {
    const f1 = makeTestFunction({
      name: 'f1',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    const f2 = makeTestFunction({
      name: 'f2',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    f1({ maxScan: 5 });
    f2({ maxScan: 5 });
  }

  it('multiple functions with the same deprecated params should both warn', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
      setupMultFunctionswithSameParams();
      process.nextTick(() => {
        expect(messages).to.deep.equal([
          'f1 parameter [maxScan]' + defaultMessage,
          'f2 parameter [maxScan]' + defaultMessage
        ]);
        expect(messages).to.have.a.lengthOf(2);
        done();
      });
    }
  });

  it('multiple functions with the same deprecated params should both warn', {
    metadata: { requires: { node: '<6.0.0' } },
    test: function(done) {
      setupMultFunctionswithSameParams();
      ensureCalledWith([
        'f1 parameter [maxScan]' + defaultMessage,
        'f2 parameter [maxScan]' + defaultMessage
      ]);
      expect(console.error).to.have.been.calledTwice;
      done();
    }
  });

  function setupNoParams() {
    const f = makeTestFunction({
      name: 'f',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    f({});
  }

  it('should not warn if no deprecated params passed in', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
      setupNoParams();
      process.nextTick(() => {
        expect(messages).to.have.a.lengthOf(0);
        done();
      });
    }
  });

  it('should not warn if no deprecated params passed in', {
    metadata: { requires: { node: '<6.0.0' } },
    test: function(done) {
      setupNoParams();
      expect(console.error).to.have.not.been.called;
      done();
    }
  });

  function setupUserMsgHandler() {
    const customMsgHandler = (name, param) => {
      return 'custom msg for function ' + name + ' and param ' + param;
    };

    const f = makeTestFunction({
      name: 'f',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0,
      msgHandler: customMsgHandler
    });

    f({ maxScan: 5, snapshot: true, fields: 'hi' });
  }

  it('should use user-specified message handler', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
      setupUserMsgHandler();
      process.nextTick(() => {
        expect(messages).to.deep.equal([
          'custom msg for function f and param maxScan',
          'custom msg for function f and param snapshot',
          'custom msg for function f and param fields'
        ]);
        expect(messages).to.have.a.lengthOf(3);
        done();
      });
    }
  });

  it('should use user-specified message handler', {
    metadata: { requires: { node: '<6.0.0' } },
    test: function(done) {
      setupUserMsgHandler();
      ensureCalledWith([
        'custom msg for function f and param maxScan',
        'custom msg for function f and param snapshot',
        'custom msg for function f and param fields'
      ]);
      expect(console.error).to.have.been.calledThrice;
      done();
    }
  });

  function setupOncePerParameter() {
    const f = makeTestFunction({
      name: 'f',
      deprecatedParams: deprecatedParams,
      optionsIndex: 0
    });
    f({ maxScan: 5, fields: 'hi' });
    f({ maxScan: 5, fields: 'hi' });
  }

  it('each function should only warn once per deprecated parameter', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
      setupOncePerParameter();
      process.nextTick(() => {
        expect(messages).to.deep.equal([
          'f parameter [maxScan]' + defaultMessage,
          'f parameter [fields]' + defaultMessage
        ]);
        expect(messages).to.have.a.lengthOf(2);
        done();
      });
    }
  });

  it('each function should only warn once per deprecated parameter', {
    metadata: { requires: { node: '<6.0.0' } },
    test: function(done) {
      setupOncePerParameter();
      ensureCalledWith([
        'f parameter [maxScan]' + defaultMessage,
        'f parameter [fields]' + defaultMessage
      ]);
      expect(console.error).to.have.been.calledTwice;
      done();
    }
  });

  function setupMaintainFunctionality() {
    const config = {
      name: 'f',
      deprecatedParams: ['multiply', 'add'],
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
  }

  it('should maintain functions original functionality', {
    metadata: { requires: { node: '>=6.0.0' } },
    test: function(done) {
      setupMaintainFunctionality();
      process.nextTick(() => {
        expect(messages).to.deep.equal([
          'f parameter [multiply]' + defaultMessage,
          'f parameter [add]' + defaultMessage
        ]);
        expect(messages).to.have.a.lengthOf(2);
        done();
      });
    }
  });

  it('should maintain functions original functionality', {
    metadata: { requires: { node: '<6.0.0' } },
    test: function(done) {
      setupMaintainFunctionality();
      ensureCalledWith([
        'f parameter [multiply]' + defaultMessage,
        'f parameter [add]' + defaultMessage
      ]);
      expect(console.error).to.have.been.calledTwice;
      done();
    }
  });
});
