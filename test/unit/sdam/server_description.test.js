'use strict';
const { ServerDescription } = require('../../../src/sdam/server_description');
const expect = require('chai').expect;

describe('ServerDescription', function() {
  describe('error equality', function() {
    [
      {
        description: 'equal error types and messages',
        lhs: new ServerDescription('127.0.0.1:27017', null, { error: new Error('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', null, { error: new Error('test') }),
        equal: true
      },
      {
        description: 'equal error types and unequal messages',
        lhs: new ServerDescription('127.0.0.1:27017', null, { error: new Error('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', null, { error: new Error('blah') }),
        equal: false
      },
      {
        description: 'unequal error types and equal messages',
        lhs: new ServerDescription('127.0.0.1:27017', null, { error: new TypeError('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', null, { error: new Error('test') }),
        equal: false
      },
      {
        description: 'null lhs',
        lhs: new ServerDescription('127.0.0.1:27017', null, { error: null }),
        rhs: new ServerDescription('127.0.0.1:27017', null, { error: new Error('test') }),
        equal: false
      },
      {
        description: 'null rhs',
        lhs: new ServerDescription('127.0.0.1:27017', null, { error: new TypeError('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', null, { error: undefined }),
        equal: false
      }
    ].forEach(test => {
      it(test.description, function() {
        expect(test.lhs.equals(test.rhs)).to.equal(test.equal);
      });
    });
  });
});
