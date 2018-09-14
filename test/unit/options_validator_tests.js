'use strict';

const expect = require('chai').expect;
const createValidationFunction = require('../../lib/options_validator').createValidationFunction;
const sinonChai = require('sinon-chai');
const sinon = require('sinon');
const chai = require('chai');
chai.use(sinonChai);

describe('Options Validation', function() {
  const testValidationLevel = 'error';

  it('Should validate a basic object with type number', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'number' }
    });

    const testObject = { a: 1 };
    const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });

    expect(validatedObject).to.deep.equal({ a: 1 });
    expect(validatedObject).to.be.frozen;
  });

  it('Should validate a basic object with type object', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'object' }
    });

    const testObject = { a: { b: 1 } };
    const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should validate a basic object with array of types', function() {
    const objectValidator = createValidationFunction({
      a: { type: ['number', 'object'] }
    });

    const testObject1 = { a: 1 };
    const validatedObject1 = objectValidator(testObject1, { validationLevel: testValidationLevel });

    expect(validatedObject1).to.deep.equal(testObject1);
    expect(validatedObject1).to.be.frozen;

    const testObject2 = { a: { b: true } };
    const validatedObject2 = objectValidator(testObject2, { validationLevel: testValidationLevel });

    expect(validatedObject2).to.deep.equal(testObject2);
    expect(validatedObject2).to.be.frozen;
  });

  it('Should validate a basic object with custom type', function() {
    function CustomType() {
      this.type = 'custom';
    }

    const objectValidator = createValidationFunction({ a: { type: CustomType } });

    const testObject = { a: new CustomType() };
    const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should ignore fields not in schema', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'boolean' }
    });

    const testObject = { b: 1 };
    const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should use default validationLevel', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'boolean' }
    });

    const testObject = { b: 1 };
    const validatedObject = objectValidator(testObject);

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should skip validation if validationLevel is none', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'boolean' }
    });

    const testObject = { a: 45 };
    const validatedObject = objectValidator(testObject, { validationLevel: 'none' });

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should warn if validationLevel is warn', function() {
    const stub = sinon.stub(console, 'warn');
    const objectValidator = createValidationFunction({
      a: { type: 'boolean' }
    });

    const testObject = { a: 45 };
    const validatedObject = objectValidator(testObject, { validationLevel: 'warn' });

    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith('a should be of type boolean, but is of type number.');
    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;

    console.warn.restore();
  });

  it('Should error if validationLevel is error', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'boolean' }
    });

    const testObject = { a: 45 };
    try {
      const validatedObject = objectValidator(testObject, { validationLevel: 'error' });
      expect(validatedObject).to.deep.equal(testObject);
      expect(validatedObject).to.be.frozen;
    } catch (err) {
      expect(err).to.not.be.null;
      expect(err.message).to.equal('a should be of type boolean, but is of type number.');
    }
  });

  it('Should fail validation if required option is not present', function() {
    const stub = sinon.stub(console, 'warn');
    const objectValidator = createValidationFunction({
      a: { required: true }
    });

    const testObject = { b: 45 };
    const validatedObject = objectValidator(testObject, { validationLevel: 'warn' });

    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith('required option [a] was not found.');
    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;

    console.warn.restore();
  });

  it('Should validate an object with required and type fields', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'boolean', required: true }
    });

    const testObject = { a: true };
    const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should fail validation if required or type fails', function() {
    const objectValidator = createValidationFunction({
      a: { type: 'boolean', required: true }
    });

    const testObject = { b: 1 };

    try {
      const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });
      expect(validatedObject).to.deep.equal(testObject);
      expect(validatedObject).to.be.frozen;
    } catch (err) {
      expect(err).to.not.be.null;
      expect(err.message).to.equal('required option [a] was not found.');
    }
  });

  it('Should set defaults', function() {
    const objectValidator = createValidationFunction({
      a: { default: true }
    });

    const testObject = { b: 3 };

    const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });
    expect(validatedObject.a).to.equal(true);
    expect(validatedObject.b).to.equal(3);
    expect(validatedObject).to.be.frozen;
  });

  it('Should deprecate options', function() {
    const stub = sinon.stub(console, 'warn');

    const objectValidator = createValidationFunction({
      a: { deprecated: true }
    });

    const testObject = { a: 3 };

    const validatedObject = objectValidator(testObject);
    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith(
      'option [a] is deprecated and will be removed in a later version.'
    );
    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;

    console.warn.restore();
  });
});
