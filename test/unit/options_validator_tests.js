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
    const objectValidator = createValidationFunction(
      {
        a: { type: 'number' }
      },
      { validationLevel: testValidationLevel }
    );

    const testObject = { a: 1 };
    const validatedObject = objectValidator(testObject);

    expect(validatedObject).to.deep.equal({ a: 1 });
    expect(validatedObject).to.be.frozen;
  });

  it('Should validate a basic object with type object', function() {
    const objectValidator = createValidationFunction(
      {
        a: { type: 'object' }
      },
      { validationLevel: testValidationLevel }
    );

    const testObject = { a: { b: 1 } };
    const validatedObject = objectValidator(testObject);

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should validate a basic object with array of types', function() {
    const objectValidator = createValidationFunction(
      {
        a: { type: ['number', 'object'] }
      },
      { validationLevel: testValidationLevel }
    );

    const testObject1 = { a: 1 };
    const validatedObject1 = objectValidator(testObject1);

    expect(validatedObject1).to.deep.equal(testObject1);
    expect(validatedObject1).to.be.frozen;

    const testObject2 = { a: { b: true } };
    const validatedObject2 = objectValidator(testObject2);

    expect(validatedObject2).to.deep.equal(testObject2);
    expect(validatedObject2).to.be.frozen;
  });

  it('Should validate a basic object with custom type', function() {
    function CustomType() {
      this.type = 'custom';
    }

    const objectValidator = createValidationFunction(
      {
        a: { type: CustomType }
      },
      { validationLevel: testValidationLevel }
    );

    const testObject = { a: new CustomType() };
    const validatedObject = objectValidator(testObject);

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should ignore fields not in schema', function() {
    const objectValidator = createValidationFunction(
      {
        a: { type: 'boolean' }
      },
      { validationLevel: testValidationLevel }
    );

    const testObject = { b: 1 };
    const validatedObject = objectValidator(testObject);

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
    const objectValidator = createValidationFunction(
      {
        a: { type: 'boolean' }
      },
      { validationLevel: 'none' }
    );

    const testObject = { a: 45 };
    const validatedObject = objectValidator(testObject);

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should warn if validationLevel is warn', function() {
    const stub = sinon.stub(console, 'warn');
    const objectValidator = createValidationFunction(
      {
        a: { type: 'boolean' }
      },
      { validationLevel: 'warn' }
    );

    const testObject = { a: 45 };
    const validatedObject = objectValidator(testObject);

    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith('a should be of type boolean, but is of type number.');
    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should error if validationLevel is error', function() {
    const objectValidator = createValidationFunction(
      {
        a: { type: 'boolean' }
      },
      { validationLevel: 'error' }
    );

    const testObject = { a: 45 };
    try {
      const validatedObject = objectValidator(testObject);
      expect(validatedObject).to.deep.equal(testObject);
      expect(validatedObject).to.be.frozen;
    } catch (err) {
      expect(err).to.not.be.null;
      expect(err.message).to.equal('a should be of type boolean, but is of type number.');
    }
  });
});
