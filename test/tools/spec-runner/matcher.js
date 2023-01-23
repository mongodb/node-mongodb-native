'use strict';

const SYMBOL_DOES_NOT_EXIST = Symbol('[[assert does not exist]]');
const SYMBOL_DOES_EXIST = Symbol('[[assert does exist]]');
const SYMBOL_IGNORE = Symbol('[[ignore]]');

const MONGOCRYPT_TO_EJSON_TYPE_MAP = new Map([
  ['binData', '$binary'],
  ['long', ['$numberLong', 'number']]
]);

const BSON_TO_EJSON_TYPE_MAP = new Map([['Binary', '$binary']]);

function valIs42(input) {
  return input === 42 || input === '42';
}

function is42(input) {
  if (!input) return false;
  return valIs42(input) || valIs42(input.$numberInt) || valIs42(input.$numberLong);
}

function generateMatchAndDiffSpecialCase(key, expectedObj, actualObj, metadata) {
  const expected = expectedObj[key];
  const actual = actualObj[key];

  if (expected === null) {
    if (key === 'readConcern') {
      // HACK: get around NODE-1889
      return {
        match: true,
        expected: SYMBOL_DOES_NOT_EXIST,
        actual: SYMBOL_DOES_NOT_EXIST
      };
    }

    if (actualObj._bsontype === 'Code' && key === 'scope') {
      // HACK: Code always has a scope property, it can sometimes be null,
      // the "does not exist" logic does not handle that
      return {
        match: actualObj.scope == null,
        expected: expectedObj,
        actual: actualObj
      };
    }

    const match = !Object.prototype.hasOwnProperty.call(actualObj, key);
    return {
      match,
      expected: SYMBOL_DOES_NOT_EXIST,
      actual: match ? SYMBOL_DOES_NOT_EXIST : actual
    };
  }

  if (typeof expected === 'object' && Object.keys(expected)[0] === '$$type') {
    const expectedType = MONGOCRYPT_TO_EJSON_TYPE_MAP.get(expected.$$type);

    let actualType;
    if (actual._bsontype) {
      actualType = BSON_TO_EJSON_TYPE_MAP.get(actual._bsontype);
    } else {
      if (typeof actual === 'object' && Object.keys(actual).length) {
        actualType = Object.keys(actual)[0];
      } else {
        actualType = typeof actual;
      }
    }

    let match;
    if (Array.isArray(expectedType)) {
      // we accept a direct type match, or a typeof match
      match = expectedType.some(type => {
        if (type[0] === '$') {
          return type === actualType;
        }

        return typeof actual === type;
      });
    } else {
      match = expectedType === actualType;
    }

    return { match, expected, actual };
  }

  const expectedIs42 = is42(expected);
  if (key === 'lsid' && typeof expected === 'string') {
    // Case lsid - assert that session matches session in session data
    const sessionData = metadata.sessionData;
    const lsid = sessionData[expected];
    return generateMatchAndDiff(lsid, actual, metadata);
  } else if (key === 'getMore' && expectedIs42) {
    // cursorid - explicitly ignore 42 values
    return {
      match: true,
      expected: SYMBOL_IGNORE,
      actual: SYMBOL_IGNORE
    };
  } else if (key === 'afterClusterTime' && expectedIs42) {
    // afterClusterTime - assert that value exists
    const match = actual != null;
    return {
      match,
      expected: match ? actual : SYMBOL_DOES_EXIST,
      actual
    };
  } else if (key === 'recoveryToken' && expectedIs42) {
    // recoveryToken - assert that value exists
    // TODO: assert that value is BSON
    const match = actual != null;
    return {
      match,
      expected: match ? actual : SYMBOL_DOES_EXIST,
      actual
    };
  } else if (expectedIs42) {
    return {
      match: true,
      expected: SYMBOL_IGNORE,
      actual: SYMBOL_IGNORE
    };
  } else {
    // default
    return generateMatchAndDiff(expected, actual, metadata);
  }
}

function generateMatchAndDiff(expected, actual, metadata) {
  const typeOfExpected = typeof expected;

  if (typeOfExpected === 'object' && expected._bsontype === 'Int32' && typeof actual === 'number') {
    return { match: expected.value === actual, expected, actual };
  }

  if (typeOfExpected !== typeof actual) {
    return { match: false, expected, actual };
  }

  if (typeOfExpected !== 'object' || expected == null || actual == null) {
    return { match: expected === actual, expected, actual };
  }

  if (expected instanceof Date) {
    return {
      match: actual instanceof Date ? expected.getTime() === actual.getTime() : false,
      expected,
      actual
    };
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return { match: false, expected, actual };
    }

    return expected
      .map((val, idx) => generateMatchAndDiff(val, actual[idx], metadata))
      .reduce(
        (ret, value) => {
          ret.match = ret.match && value.match;
          ret.expected.push(value.expected);
          ret.actual.push(value.actual);
          return ret;
        },
        { match: true, expected: [], actual: [] }
      );
  }

  return Object.keys(expected).reduce(
    (ret, key) => {
      const check = generateMatchAndDiffSpecialCase(key, expected, actual, metadata);
      ret.match = ret.match && check.match;
      ret.expected[key] = check.expected;
      ret.actual[key] = check.actual;
      return ret;
    },
    {
      match: true,
      expected: {},
      actual: {}
    }
  );
}

function matchMongoSpec(chai, utils) {
  chai.Assertion.addMethod('withSessionData', function (sessionData) {
    utils.flag(this, 'testRunnerSessionData', sessionData);
  });

  chai.Assertion.addMethod('matchMongoSpec', function (expected) {
    const actual = utils.flag(this, 'object');

    const sessionData = utils.flag(this, 'testRunnerSessionData');

    const result = generateMatchAndDiff(expected, actual, { sessionData });

    chai.Assertion.prototype.assert.call(
      this,
      result.match,
      'expected #{act} to match spec #{exp}',
      'expected #{act} to not match spec #{exp}',
      result.expected,
      result.actual,
      chai.config.showDiff || true
    );
  });

  chai.assert.matchMongoSpec = function (val, exp, msg) {
    new chai.Assertion(val, msg).to.matchMongoSpec(exp);
  };
}

module.exports.default = matchMongoSpec;
