'use strict';

const arity = require('../../lib/options_validator').arity;
const assertArity = require('../../lib/options_validator').assertArity;
const createValidationFunction = require('../../lib/options_validator').createValidationFunction;
const expect = require('chai').expect;
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
    const stub = process.emitWarning
      ? sinon.stub(process, 'emitWarning')
      : sinon.stub(console, 'error');

    const objectValidator = createValidationFunction({
      a: { deprecated: true }
    });

    const testObject = { a: 3 };

    const validatedObject = objectValidator(testObject, { validationLevel: testValidationLevel });
    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith(
      'option [a] is deprecated and will be removed in a later version.'
    );
    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;

    process.emitWarning ? process.emitWarning.restore() : console.error.restore();
  });

  it('Should override options with value in overrideOptions', function() {
    function CustomObject() {
      this.a = 'custom';
      this.b = 'override';
    }
    const customObject = new CustomObject();

    const objectValidator = createValidationFunction({
      a: { type: 'string' },
      b: { type: 'string' }
    });

    const testObject = {};

    const validatedObject = objectValidator(
      testObject,
      { a: customObject.a, b: customObject.b },
      { validationLevel: testValidationLevel }
    );

    expect(validatedObject).to.deep.equal({ a: 'custom', b: 'override' });
    expect(validatedObject).to.be.frozen;

    const validatedObject2 = objectValidator(
      testObject,
      { a: customObject.a, b: customObject.b },
      { validationLevel: 'none' }
    );

    expect(validatedObject2).to.deep.equal({ a: 'custom', b: 'override' });
    expect(validatedObject2).to.be.frozen;
  });

  it('Should not override a provided option', function() {
    function CustomObject() {
      this.a = 'custom';
    }
    const customObject = new CustomObject();

    const objectValidator = createValidationFunction({ a: { type: 'string' } });

    const testObject = { a: 'hello' };

    const validatedObject = objectValidator(
      testObject,
      { a: customObject.a },
      { validationLevel: testValidationLevel }
    );

    expect(validatedObject).to.deep.equal(testObject);
    expect(validatedObject).to.be.frozen;
  });

  it('Should warn for override and default', function() {
    const stub = sinon.stub(console, 'warn');

    function CustomObject() {
      this.a = 'custom';
    }
    const customObject = new CustomObject();

    const objectValidator = createValidationFunction({ a: { type: 'string', default: 'default' } });

    const testObject = {};

    const validatedObject = objectValidator(
      testObject,
      { a: customObject.a },
      { validationLevel: testValidationLevel }
    );

    expect(stub).have.been.calledOnce;
    expect(stub).to.have.been.calledWith(
      'A default value and override value were provided for option [a]. The override value will be used.'
    );
    expect(validatedObject).to.deep.equal({ a: 'custom' });
    expect(validatedObject).to.be.frozen;

    console.warn.restore();
  });

  [
    {
      description: 'Should fail arity 0 if too many arguments are provided',
      func: args => assertArity(args, 0),
      numberOfArgs: 2,
      errorMessageMatch: /This operation has a required arity of 0, but 2 arguments were provided./
    },
    {
      description: 'Should fail arity 1 if too many arguments are provided',
      func: args => assertArity(args, 1),
      numberOfArgs: 3,
      errorMessageMatch: /This operation has a required arity of 1, but 3 arguments were provided./
    },
    {
      description: 'Should fail arity 2 if too many arguments are provided',
      func: args => assertArity(args, 2),
      numberOfArgs: 4,
      errorMessageMatch: /This operation has a required arity of 2, but 4 arguments were provided./
    },
    {
      description: 'Should fail arity 1 if too few arguments are provided',
      func: args => assertArity(args, 1),
      numberOfArgs: 0,
      errorMessageMatch: /This operation has a required arity of 1, but 0 arguments were provided./
    },
    {
      description: 'Should fail arity 2 if too few arguments are provided',
      func: args => assertArity(args, 2),
      numberOfArgs: 1,
      errorMessageMatch: /This operation has a required arity of 2, but 1 arguments were provided./
    },
    {
      description: 'Should pass arity 0',
      func: args => assertArity(args, 0),
      numberOfArgs: 0
    },
    {
      description: 'Should pass arity 1',
      func: args => assertArity(args, 1),
      numberOfArgs: 1
    },
    {
      description: 'Should pass arity 2',
      func: args => assertArity(args, 2),
      numberOfArgs: 2
    }
  ].forEach(test => {
    it(test.description, function() {
      let args = [];
      if (test.errorMessageMatch) {
        for (let i = 0; i < test.numberOfArgs; i++) {
          args.push(i);
        }
        expect(() => test.func(args)).to.throw(test.errorMessageMatch);
      } else {
        // test that it passes with only the required arguments
        for (let i = 0; i < test.numberOfArgs; i++) {
          args.push(i);
        }
        expect(() => test.func(args)).to.not.throw;
        // test that it passes with one optional argument (options)
        args.push(test.numberOfArgs);
        expect(() => test.func(args)).to.not.throw;
        // test that it passes with a callback and an optional argument
        args.push(() => console.log('callback'));
        expect(() => test.func(args)).to.not.throw;
      }
    });
  });

  it('Should validate options using OperationBuilder', function() {
    const testOperationBuilder = arity(1)
      .options({ a: { type: 'boolean' } })
      .build(
        function(a) {
          return a;
        },
        { validationLevel: 'error' }
      );

    const testObject = { a: 3 };

    try {
      testOperationBuilder(testObject);
    } catch (err) {
      expect(err).to.not.be.null;
      expect(err.message).to.equal('a should be of type boolean, but is of type number.');
    }
  });
});
