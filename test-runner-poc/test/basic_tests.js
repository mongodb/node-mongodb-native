'use strict';

const expect = require('chai').expect;

describe('simple test', () => {
  it('a test', function() {
    console.log('test one');
  });

  it('b test', function() {
    console.log('test two');
  });
});

describe('metadata parsing', () => {
  it('should appear when specified as the 2nd parameter', () => {
    var test = it(
      'should split on a delimiter, with metadata as 2nd parameter',
      { requires: { topology: 'replicaset', mongodb: '>= 3.2' } },
      () => {
        console.log("this shouldn't print out");
        var parts = '1,2,3'.split(',');
        expect(parts).to.eql(['1', '2', '3']);
      }
    );
    expect(test.metadata).to.eql({ requires: { topology: 'replicaset', mongodb: '>= 3.2' } });
  });
});
