'use strict';

const expect = require('chai').expect;

describe('simple test', function () {
	it('a test', function() {
		console.log('test one');
	});

	it('b test', function() {
		console.log('test two');
	});
});

describe('metadata parsing', () => {
	it('should appear when specified as the 2nd parameter', {
		metadata: { requires: {topology: 'replicaset'}},
	test: function() {
	    // var test = it('should split on a delimiter, with metadata as 2nd parameter',
	    //   { requires: {topology: 'replicaset', mongodb: '>= 3.2'} }, () => {
	    //   	console.log("test.metadata: ",test.metadata);
	    //     var parts = '1,2,3'.split(',');
	    //     expect(parts).to.eql(['1', '2', '3']);
	    //   });
			// console.log("test ",test);
    	expect(test.metadata).to.eql({requires: {topology: 'replicaset', mongodb: '>= 3.2'} });
		}
	});
});
