import { expect } from 'chai';

import { Long, ObjectId } from '../../../src/bson';
import {
  compareTopologyVersion,
  ServerDescription,
  TopologyVersion
} from '../../../src/sdam/server_description';

describe('ServerDescription', function () {
  describe('error equality', function () {
    const errorEqualityTests = [
      {
        description: 'equal error types and messages',
        lhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new Error('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new Error('test') }),
        equal: true
      },
      {
        description: 'equal error types and unequal messages',
        lhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new Error('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new Error('blah') }),
        equal: false
      },
      {
        description: 'unequal error types and equal messages',
        lhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new TypeError('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new Error('test') }),
        equal: false
      },
      {
        description: 'null lhs',
        lhs: new ServerDescription('127.0.0.1:27017', undefined, { error: null }),
        rhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new Error('test') }),
        equal: false
      },
      {
        description: 'null rhs',
        lhs: new ServerDescription('127.0.0.1:27017', undefined, { error: new TypeError('test') }),
        rhs: new ServerDescription('127.0.0.1:27017', undefined, { error: undefined }),
        equal: false
      }
    ];

    for (const test of errorEqualityTests) {
      it(test.description, function () {
        expect(test.lhs.equals(test.rhs)).to.equal(test.equal);
      });
    }
  });

  it('should sensibly parse an ipv6 address', function () {
    const description = new ServerDescription('[ABCD:f::abcd:abcd:abcd:abcd]:27017');
    expect(description.host).to.equal('abcd:f::abcd:abcd:abcd:abcd');
    expect(description.port).to.equal(27017);
  });

  describe('compareTopologyVersion()', () => {
    const processIdZero = new ObjectId('00'.repeat(12));
    const processIdOne = new ObjectId('00'.repeat(11) + '01');
    const compareTopologyVersionTests: {
      title: string;
      currentTv?: TopologyVersion;
      newTv?: TopologyVersion;
      out: 0 | -1 | 1;
    }[] = [
      {
        title: 'should return that currentTv and newTv are equal',
        currentTv: { processId: processIdZero, counter: Long.ZERO },
        newTv: { processId: processIdZero, counter: Long.ZERO },
        out: 0
      },
      {
        title: 'should return that currentTv and newTv are equal, both counters as numbers',
        // @ts-expect-error: Testing that the function handles numbers
        currentTv: { processId: processIdZero, counter: 2 },
        // @ts-expect-error: Testing that the function handles numbers
        newTv: { processId: processIdZero, counter: 2 },
        out: 0
      },
      {
        title: 'should return that currentTv and newTv are equal newTv.counter as number',
        currentTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        // @ts-expect-error: Testing that the function handles numbers
        newTv: { processId: processIdZero, counter: 2 },
        out: 0
      },
      {
        title: 'should return that currentTv and newTv are equal currentTv.counter as number',
        // @ts-expect-error: Testing that the function handles numbers
        currentTv: { processId: processIdZero, counter: 2 },
        newTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        out: 0
      },
      {
        title: 'should return that newTv is greater than currentTv when null',
        currentTv: undefined,
        newTv: undefined,
        out: -1
      },
      {
        title: 'should return that newTv is greater than currentTv when processIds are not equal',
        // Even if processId of current is greater, it is not an ordered value
        currentTv: { processId: processIdOne, counter: Long.fromNumber(2) },
        newTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        out: -1
      },
      {
        title:
          'should return that newTv is greater than currentTv when currentTv.counter is smaller',
        currentTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        newTv: { processId: processIdZero, counter: Long.fromNumber(3) },
        out: -1
      },
      {
        title:
          'should return that currentTv is greater than newTv when currentTv.counter is greater',
        currentTv: { processId: processIdZero, counter: Long.fromNumber(3) },
        newTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        out: 1
      }
    ];
    for (const { title, currentTv, newTv, out } of compareTopologyVersionTests) {
      it(title, () => {
        expect(compareTopologyVersion(currentTv, newTv)).to.equal(out);
      });
    }
  });
});
