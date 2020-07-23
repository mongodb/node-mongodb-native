'use strict';

const sinon = require('sinon');
const chai = require('chai');
const expect = chai.expect;
const {
  CoerceError,
  CoerceDeprecate,
  CoerceUnrecognized
} = require('../../../src/options/coerce_error');
const Errors = require('../../../src/options/coerce_error');

describe('CoerceError', () => {
  let warningStub;
  beforeEach(() => {
    warningStub = sinon.stub(Errors.CoerceError.prototype, 'warn').returns({});
  });

  afterEach(() => {
    Errors.CoerceError.prototype.warn.restore();
  });

  context('constructor()', () => {
    it('basic constructor', () => {
      const options = { id: 'id', warn: false, typeSuffix: 'typeSuffix' };
      const inst = new CoerceError('example', false, options);
      expect(inst.typeName).to.deep.equals('example typeSuffix');
      expect(inst.value).to.deep.equals(false);
      expect(inst.id).to.deep.equals('id');
      expect(warningStub.calledOnce).to.equal(false);
    });
    it('constructor warns', () => {
      const options = { id: 'id', warn: true, typeSuffix: 'typeSuffix' };
      const inst = new CoerceError('example', true, options);
      expect(inst.typeName).to.deep.equals('example typeSuffix');
      expect(inst.value).to.deep.equals(true);
      expect(inst.id).to.deep.equals('id');
      expect(warningStub.calledOnce).to.equal(true);
    });
    it('empty options does not warn', () => {
      new CoerceError('example', true);
      expect(warningStub.calledOnce).to.equal(false);
    });
  });
  context('.displayValue()', () => {
    it('should create display value based on value', () => {
      expect(CoerceError.displayValue(undefined)).to.equal(`"undefined"`);
      expect(CoerceError.displayValue(null)).to.equal(`"null"`);
      expect(CoerceError.displayValue(true)).to.equal(`"true"`);
      expect(CoerceError.displayValue(false)).to.equal(`"false"`);
      expect(CoerceError.displayValue(['anything'])).to.equal(`"[...]"`);
      expect(CoerceError.displayValue({ anything: true })).to.equal(`"{...}"`);
      expect(CoerceError.displayValue(1)).to.equal(`"1"`);
    });
  });

  context('.createMessage()', () => {
    it('should create display value based on value', () => {
      expect(CoerceError.createMessage()).to.equal(`Invalid type`);
      expect(CoerceError.createMessage('boolean')).to.equal(
        `Invalid type: value "undefined" is not valid "boolean"`
      );
      expect(CoerceError.createMessage('boolean', 1)).to.equal(
        `Invalid type: value "1" is not valid "boolean"`
      );
      expect(CoerceError.createMessage('boolean', 1, 'enabled')).to.equal(
        `Invalid type: "enabled" with value "1" is not valid "boolean"`
      );
    });
  });

  context('.warn()', () => {
    it('should warn', () => {
      const inst = new CoerceError('example', false);
      inst.warn();
      expect(warningStub.calledOnce).to.equal(true);
    });
  });
});

describe('CoerceDeprecate', () => {
  let warningStub;
  beforeEach(() => {
    warningStub = sinon.stub(Errors.CoerceDeprecate.prototype, 'warn').returns({});
  });

  afterEach(() => {
    Errors.CoerceDeprecate.prototype.warn.restore();
  });

  context('constructor()', () => {
    it('basic constructor', () => {
      const inst = new CoerceDeprecate('id', 'favor');
      expect(inst.id).to.deep.equals('id');
      expect(inst.favor).to.deep.equals('favor');
      expect(warningStub.calledOnce).to.equal(false);
    });
  });

  context('.createMessage()', () => {
    it('should create display value based on value', () => {
      expect(CoerceDeprecate.createMessage()).to.equal(
        `Deprecation notice: something used was deprecated, however no reference was passed`
      );
      expect(CoerceDeprecate.createMessage('id')).to.equal(
        `Deprecation notice: 'id' is deprecated`
      );
      expect(CoerceDeprecate.createMessage('id', 'favor')).to.equal(
        `Deprecation notice: 'id' is deprecated, please use 'favor' instead`
      );
    });
  });

  context('.warn()', () => {
    it('should warn', () => {
      const inst = new CoerceDeprecate('example', false);
      inst.warn();
      expect(warningStub.calledOnce).to.equal(true);
    });
  });
});

describe('CoerceUnrecognized', () => {
  let warningStub;
  beforeEach(() => {
    warningStub = sinon.stub(Errors.CoerceUnrecognized.prototype, 'warn').returns({});
  });

  afterEach(() => {
    Errors.CoerceUnrecognized.prototype.warn.restore();
  });

  context('constructor()', () => {
    it('basic constructor', () => {
      const inst = new CoerceUnrecognized('id');
      expect(inst.id).to.deep.equals('id');
      expect(warningStub.calledOnce).to.equal(false);
    });
  });

  context('.createMessage()', () => {
    it('should create display value based on value', () => {
      expect(CoerceUnrecognized.createMessage()).to.equal(
        `Unrecognized notice: something used was unrecognized, however no reference was passed`
      );
      expect(CoerceUnrecognized.createMessage('id')).to.equal(
        `Unrecognized notice: property 'id' is not recognized`
      );
    });
  });

  context('.warn()', () => {
    it('should warn', () => {
      const inst = new CoerceUnrecognized('example', false);
      inst.warn();
      expect(warningStub.calledOnce).to.equal(true);
    });
  });
});
