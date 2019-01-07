'use strict';

const applyDefaults = require('../../lib/options_validator').applyDefaults;
const arityZero = require('../../lib/options_validator').arityZero;
const arityOne = require('../../lib/options_validator').arityOne;
const arityTwo = require('../../lib/options_validator').arityTwo;
const assertArity = require('../../lib/options_validator').assertArity;
const validate = require('../../lib/options_validator').validate;
const expect = require('chai').expect;
const sinonChai = require('sinon-chai');
const sinon = require('sinon');
const chai = require('chai');
chai.use(sinonChai);

describe('Options Validation', function() {
  const testValidationLevel = 'error';

  it('Should validate a basic object with type number', function() {
    const validationSchema = {
      a: { type: 'number' }
    };

    const testObject = { a: 1 };
    expect(() => {
      validate(validationSchema, testObject, { optionsValidationLevel: testValidationLevel });
    }).to.not.throw;
  });

  it('Should validate a basic object with type object', function() {
    const validationSchema = {
      a: { type: 'object' }
    };

    const testObject = { a: { b: 1 } };
    expect(() => {
      validate(validationSchema, testObject, { optionsValidationLevel: testValidationLevel });
    }).to.not.throw;
  });

  it('Should validate a basic object with array of types', function() {
    const validationSchema = {
      a: { type: ['number', 'object'] }
    };

    const testObject1 = { a: 1 };
    expect(() => {
      validate(validationSchema, testObject1, { optionsValidationLevel: testValidationLevel });
    }).to.not.throw;

    const testObject2 = { a: { b: true } };
    expect(() => {
      validate(validationSchema, testObject2, { optionsValidationLevel: testValidationLevel });
    }).to.not.throw;
  });

  it('Should validate a basic object with custom type', function() {
    function CustomType() {
      this.type = 'custom';
    }

    const validationSchema = { a: { type: CustomType } };

    const testObject = { a: new CustomType() };

    expect(() => {
      validate(validationSchema, testObject, { optionsValidationLevel: testValidationLevel });
    }).to.not.throw;
  });

  it('Should ignore fields not in schema', function() {
    const validationSchema = {
      a: { type: 'boolean' }
    };

    const testObject = { b: 1 };

    expect(() => {
      validate(validationSchema, testObject, { optionsValidationLevel: testValidationLevel });
    }).to.not.throw;
  });

  it('Should set defaults, set overrides, and emit deprecation notices if optionsValidationLevel is none', function() {
    const stub = process.emitWarning
      ? sinon.stub(process, 'emitWarning')
      : sinon.stub(console, 'error');

    const validationSchema = {
      a: { type: 'boolean' },
      b: { type: 'number', default: 1 },
      c: { type: 'number', deprecated: true },
      d: { type: 'number' },
      e: { type: 'number' }
    };

    const testObject = { a: 45, c: 3, e: 5 };
    validate(validationSchema, testObject, { optionsValidationLevel: 'none' });

    const validatedObject = applyDefaults(validationSchema, testObject, { d: 2 }, { e: 0 });

    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith(
      'option [c] is deprecated and will be removed in a later version.'
    );
    expect(validatedObject).to.deep.equal({ a: 45, b: 1, c: 3, d: 2, e: 0 });

    process.emitWarning ? process.emitWarning.restore() : console.error.restore();
  });

  it('Should check required for all validation levels', function() {
    const validationSchema = { a: { type: 'boolean', required: true } };

    const testObject = {};
    expect(() => {
      validate(validationSchema, testObject, { optionsValidationLevel: 'none' });
    }).to.throw('required option [a] was not found.');
    expect(() => {
      validate(validationSchema, testObject, { optionsValidationLevel: 'warn' });
    }).to.throw('required option [a] was not found.');
    expect(() => {
      validate(validationSchema, testObject, { optionsValidationLevel: 'error' });
    }).to.throw('required option [a] was not found.');
  });

  it('Should warn if optionsValidationLevel is warn', function() {
    const stub = sinon.stub(console, 'warn');
    const validationSchema = {
      a: { type: 'boolean' }
    };

    const testObject = { a: 45 };
    validate(validationSchema, testObject, { optionsValidationLevel: 'warn' });

    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith(
      'option [a] should be of type boolean, but is of type number.'
    );
    expect(validatedObject).to.deep.equal(testObject);

    console.warn.restore();
  });

  it('Should error if optionsValidationLevel is error', function() {
    const validationSchema = {
      a: { type: 'boolean' }
    };

    const testObject = { a: 45 };
    try {
      validate(validationSchema, testObject, { optionsValidationLevel: 'error' });
    } catch (err) {
      expect(err).to.not.be.null;
      expect(err.message).to.equal('option [a] should be of type boolean, but is of type number.');
    }
  });

  it('Should validate an object with required and type fields', function() {
    const stub = process.emitWarning
      ? sinon.stub(process, 'emitWarning')
      : sinon.stub(console, 'error');

    const validationSchema = {
      a: { type: 'boolean', required: true }
    };

    const testObject = { a: true };
    validate(validationSchema, testObject, { optionsValidationLevel: testValidationLevel });

    expect(stub).to.not.have.been.calledOnce;

    process.emitWarning ? process.emitWarning.restore() : console.error.restore();
  });

  it('Should fail validation if required or type fails', function() {
    const validationSchema = {
      a: { type: 'boolean', required: true }
    };

    const testObject = { b: 1 };

    try {
      validate(validationSchema, testObject, { optionsValidationLevel: testValidationLevel });
    } catch (err) {
      expect(err).to.not.be.null;
      expect(err.message).to.equal('required option [a] was not found.');
    }
  });

  it('Should set defaults', function() {
    const validationSchema = {
      a: { default: true }
    };

    const testObject = { b: 3 };

    const validatedObject = applyDefaults(validationSchema, testObject, {});
    expect(validatedObject.a).to.equal(true);
    expect(validatedObject.b).to.equal(3);
  });

  it('Should deprecate options', function() {
    const stub = process.emitWarning
      ? sinon.stub(process, 'emitWarning')
      : sinon.stub(console, 'error');

    const validationSchema = {
      a: { deprecated: true }
    };

    const testObject = { a: 3 };

    validate(validationSchema, testObject, { optionsValidationLevel: testValidationLevel });
    expect(stub).to.have.been.calledOnce;
    expect(stub).to.have.been.calledWith(
      'option [a] is deprecated and will be removed in a later version.'
    );

    process.emitWarning ? process.emitWarning.restore() : console.error.restore();
  });

  it('Should override options with value in overrideOptions', function() {
    function CustomObject() {
      this.a = 'custom';
      this.b = 'override';
    }
    const customObject = new CustomObject();

    const validationSchema = {
      a: { type: 'string' },
      b: { type: 'string' }
    };

    const testObject = {};

    const validatedObject = applyDefaults(
      validationSchema,
      testObject,
      {},
      { a: customObject.a, b: customObject.b },
      { optionsValidationLevel: testValidationLevel }
    );

    expect(validatedObject).to.deep.equal({ a: 'custom', b: 'override' });

    const validatedObject2 = applyDefaults(
      validationSchema,
      testObject,
      {},
      { a: customObject.a, b: customObject.b }
    );

    expect(validatedObject2).to.deep.equal({ a: 'custom', b: 'override' });
  });

  it('Should not override a provided option', function() {
    function CustomObject() {
      this.a = 'custom';
    }
    const customObject = new CustomObject();

    const validationSchema = { a: { type: 'string' } };

    const testObject = { a: 'hello' };

    const validatedObject = applyDefaults(validationSchema, testObject, {}, { a: customObject.a });

    expect(validatedObject).to.deep.equal({ a: 'custom' });
  });

  it('Should warn for override and default', function() {
    const stub = sinon.stub(console, 'warn');

    function CustomObject() {
      this.a = 'custom';
    }
    const customObject = new CustomObject();

    const validationSchema = { a: { type: 'string', default: 'default' } };

    const testObject = {};

    const validatedObject = applyDefaults(validationSchema, testObject, {}, { a: customObject.a });

    expect(stub).have.been.calledOnce;
    expect(stub).to.have.been.calledWith(
      'A default value and override value were provided for option [a]. The override value will be used.'
    );
    expect(validatedObject).to.deep.equal({ a: 'custom' });

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

  it.skip('Should validate options using OperationBuilder', function() {
    class TestClass {
      constructor() {
        this.s = { options: { optionsValidationLevel: 'error' } };
      }
    }

    TestClass.prototype.testOperation = arityOne()
      .options({ a: { type: 'boolean' } })
      .build(function(a) {
        return a;
      });

    const testObject = { a: 3 };

    const testClass = new TestClass();
    try {
      testClass.testOperation(testObject);
    } catch (err) {
      expect(err).to.not.be.null;
      expect(err.message).to.equal('a should be of type boolean, but is of type number.');
    }
  });

  it.skip('Should override options using OperationBuilder', function() {
    class TestClass {
      constructor() {
        this.s = { options: { optionsValidationLevel: 'error' } };
      }
    }

    class CustomObject {
      constructor() {
        this.a = 'override';
      }
    }

    const customObject = new CustomObject();

    TestClass.prototype.testOperation = arityZero()
      .options({ a: { type: 'string' } })
      .overrides({ a: customObject.a })
      .build(function(a) {
        return a;
      });

    const testObject = {};

    const testClass = new TestClass();
    const validatedObject = testClass.testOperation(testObject);
    expect(validatedObject).to.deep.equal({ a: 'override' });
  });

  it.skip('Should properly validate when no options are provided', function() {
    class TestClass {
      constructor() {
        this.s = { options: { optionsValidationLevel: 'error' } };
      }
    }

    TestClass.prototype.testOperation = arityOne()
      .options({ a: { type: 'string' } })
      .build(function(requiredArgument) {
        return requiredArgument;
      });

    TestClass.prototype.testOperationTwo = arityTwo()
      .options({ a: { type: 'string' } })
      .build(function(requiredArgument, requiredArgumentTwo) {
        return requiredArgument + requiredArgumentTwo;
      });

    const testClass = new TestClass();
    const testResult = testClass.testOperation(1);
    expect(testResult).to.equal(1);

    const testResultTwo = testClass.testOperationTwo(1, 2);
    expect(testResultTwo).to.equal(3);
  });

  it.skip('Should fail with an object in the options position', function() {
    class TestClass {
      constructor() {
        this.s = { options: { optionsValidationLevel: 'error' } };
      }
    }

    TestClass.prototype.testOperation = arityOne()
      .options({})
      .build(function(requiredArgument) {
        return requiredArgument;
      });

    const errorMessage = 'This operation has a required arity of 1, but 4 arguments were provided.';
    const testClass = new TestClass();
    expect(() => {
      testClass.testOperation({ a: 1 }, { b: 2 }, () => {}, () => {});
    }).to.throw(errorMessage);
  });

  it.skip('Should correctly handle a promise', function() {
    class TestClass {
      constructor() {
        this.s = { options: { optionsValidationLevel: 'error' } };
      }
    }

    TestClass.prototype.testOperation = arityOne()
      .options({ b: { type: 'boolean', default: false } })
      .build(function(requiredArgument, options, callback) {
        return this.testOperation2(requiredArgument, options, callback);
      });

    TestClass.prototype.testOperation2 = arityOne()
      .options({ b: { type: 'boolean' } })
      .build(function(requiredArgument, options, callback) {
        return executeTestOperation(testOperation2, [this, requiredArgument, options, callback]);
      });

    function testOperation2(requiredArgument) {
      return requiredArgument;
    }

    function executeTestOperation(operation, args) {
      return new Promise(function(resolve, reject) {
        args[args.length - 1] = (err, result) => (err ? reject(err) : resolve(result));
        return operation.apply(null, args);
      });
    }

    const testClass = new TestClass();
    testClass.testOperation({ a: 1 }).then(result => {
      expect(result).to.deep.equal({ a: 1 });
    });
  });

  it.skip('Should allow a boolean default', function() {
    class TestClass {
      constructor() {
        this.s = { options: { optionsValidationLevel: 'error' } };
      }
    }

    TestClass.prototype.testOperation = arityZero()
      .options({ a: { type: 'boolean', default: false } })
      .build(function(requiredArgument) {
        return requiredArgument;
      });

    const testClass = new TestClass();
    const testResult = testClass.testOperation();
    expect(testResult).to.deep.equal({ a: false });
  });
});
