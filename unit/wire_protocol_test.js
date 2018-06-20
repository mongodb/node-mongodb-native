'use strict';

const chai = require('chai');
const expect = chai.expect;
const bson = require('bson');
const sinon = require('sinon');
const Pool = require('../../../lib/connection/pool.js');
const wireProtocol2_6 = require('../../../lib/wireprotocol/2_6_support.js');
const wireProtocol3_2 = require('../../../lib/wireprotocol/3_2_support.js');

describe('WireProtocol', function() {
  it('2.6 should only set bypassDocumentValidation to true if explicitly set by user to true', function() {
    testPoolWrite(true, new wireProtocol2_6(), true);
  });

  it('2.6 should not set bypassDocumentValidation to anything if not explicitly set by user to true', function() {
    testPoolWrite(false, new wireProtocol2_6(), undefined);
  });

  it('3.2 should only set bypassDocumentValidation to true if explicitly set by user to true', function() {
    testPoolWrite(true, new wireProtocol3_2(), true);
  });

  it('3.2 should not set bypassDocumentValidation to anything if not explicitly set by user to true', function() {
    testPoolWrite(false, new wireProtocol3_2(), undefined);
  });

  function testPoolWrite(bypassDocumentValidation, wireProtocol, expected) {
    const pool = sinon.createStubInstance(Pool);
    const ns = 'fake.namespace';
    const ops = [{ a: 1 }, { b: 2 }];
    const options = { bypassDocumentValidation: bypassDocumentValidation };

    wireProtocol.insert(pool, ns, bson, ops, options, () => {});

    if (expected) {
      expect(pool.write.lastCall.args[0])
        .to.have.nested.property('query.bypassDocumentValidation')
        .that.equals(expected);
    } else {
      expect(pool.write.lastCall.args[0]).to.not.have.nested.property(
        'query.bypassDocumentValidation'
      );
    }
  }
});
