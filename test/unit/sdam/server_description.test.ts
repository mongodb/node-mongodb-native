import { expect } from 'chai';

import {
  compareTopologyVersion,
  Long,
  MongoRuntimeError,
  ObjectId,
  ServerDescription,
  type TopologyVersion
} from '../../mongodb';

describe('ServerDescription', function () {
  describe('constructor()', () => {
    it('should throw if given a null address', () => {
      // @ts-expect-error: Passing nullish value to prove error will be thrown
      expect(() => new ServerDescription(null)).to.throw(MongoRuntimeError);
      // @ts-expect-error: Passing nullish value to prove error will be thrown
      expect(() => new ServerDescription()).to.throw(MongoRuntimeError);
    });

    it('should throw if given an empty string for an address', () => {
      expect(() => new ServerDescription('')).to.throw(MongoRuntimeError);
    });
  });

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

  it('should normalize an IPv6 address with brackets and toLowered characters', function () {
    const description = new ServerDescription('[ABCD:f::abcd:abcd:abcd:abcd]:1234');
    expect(description.host).to.equal('[abcd:f::abcd:abcd:abcd:abcd]'); // IPv6 Addresses must always be bracketed if there is a port
    expect(description.port).to.equal(1234);
  });

  it('should normalize an IPv6 address with brackets and toLowered characters even when the port is omitted', function () {
    const description = new ServerDescription('[ABCD:f::abcd:abcd:abcd:abcd]');
    expect(description.host).to.equal('[abcd:f::abcd:abcd:abcd:abcd]');
    expect(description.port).to.equal(27017);
  });

  describe('compareTopologyVersion()', () => {
    const processIdZero = new ObjectId('00'.repeat(12));
    const processIdOne = new ObjectId('00'.repeat(11) + '01');
    type CompareTopologyVersionTest = {
      title: string;
      currentTv?: TopologyVersion | null;
      newTv?: TopologyVersion | null;
      out: 0 | -1 | 1;
    };

    const compareTopologyVersionEqualTests: CompareTopologyVersionTest[] = [
      {
        title: 'when process ids are equal and both counter values are Long.ZERO',
        currentTv: { processId: processIdZero, counter: Long.ZERO },
        newTv: { processId: processIdZero, counter: Long.ZERO },
        out: 0
      },
      {
        title: 'when process ids are equal and both counter values are non-zero numbers',
        // @ts-expect-error: Testing that the function handles numbers
        currentTv: { processId: processIdZero, counter: 2 },
        // @ts-expect-error: Testing that the function handles numbers
        newTv: { processId: processIdZero, counter: 2 },
        out: 0
      },
      {
        title: 'when process ids are equal and both counter values are zero numbers',
        // @ts-expect-error: Testing that the function handles numbers
        currentTv: { processId: processIdZero, counter: 0 },
        // @ts-expect-error: Testing that the function handles numbers
        newTv: { processId: processIdZero, counter: 0 },
        out: 0
      },
      {
        title:
          'when process ids are equal and counter values are equal but current has a different type',
        currentTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        // @ts-expect-error: Testing that the function handles numbers
        newTv: { processId: processIdZero, counter: 2 },
        out: 0
      },
      {
        title:
          'when process ids are equal and counter values are equal but new has a different type',
        // @ts-expect-error: Testing that the function handles numbers
        currentTv: { processId: processIdZero, counter: 2 },
        newTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        out: 0
      },
      {
        title: 'when process ids are equal and counter values are equal and both are Long',
        currentTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        newTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        out: 0
      }
    ];
    const compareTopologyVersionLessThanTests: CompareTopologyVersionTest[] = [
      {
        title: 'when both versions are null',
        currentTv: null,
        newTv: null,
        out: -1
      },
      {
        title: 'when both versions are undefined',
        currentTv: undefined,
        newTv: undefined,
        out: -1
      },
      {
        title: 'when current is null and new is undefined',
        currentTv: null,
        newTv: undefined,
        out: -1
      },
      {
        title: 'when current is undefined and new is null',
        currentTv: undefined,
        newTv: null,
        out: -1
      },
      {
        title:
          'when new processId is greater the topologyVersion is too regardless of counter being less',
        // Even if processId of current is greater, it is not an ordered value
        currentTv: { processId: processIdOne, counter: Long.fromNumber(2) },
        newTv: { processId: processIdZero, counter: Long.fromNumber(1) },
        out: -1
      },
      {
        title: 'when processIds are equal but new counter is greater',
        currentTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        newTv: { processId: processIdZero, counter: Long.fromNumber(3) },
        out: -1
      }
    ];
    const compareTopologyVersionGreaterThanTests: CompareTopologyVersionTest[] = [
      {
        title: 'when processIds are equal but new counter is less than current',
        currentTv: { processId: processIdZero, counter: Long.fromNumber(3) },
        newTv: { processId: processIdZero, counter: Long.fromNumber(2) },
        out: 1
      }
    ];

    const makeTopologyVersionComparisonTests = tests => {
      for (const { title, currentTv, newTv, out } of tests) {
        it(title, () => {
          expect(compareTopologyVersion(currentTv, newTv)).to.equal(out);
        });
      }
    };
    context('should return that versions are equal', () => {
      makeTopologyVersionComparisonTests(compareTopologyVersionEqualTests);
    });
    context('should return that current version is less than', () => {
      makeTopologyVersionComparisonTests(compareTopologyVersionLessThanTests);
    });
    context('should return that current version is greater than', () => {
      makeTopologyVersionComparisonTests(compareTopologyVersionGreaterThanTests);
    });
  });

  describe('roundTripTime()', function () {
    let serverDescription: ServerDescription;

    beforeEach(() => {
      serverDescription = new ServerDescription('localhost:27017');
    });

    context('when no samples have been taken', function () {
      it('returns -1 when no samples have been taken', function () {
        expect(serverDescription.roundTripTime).to.equal(-1);
      });
    });

    context('when a postitive number of samples have been taken', function () {
      beforeEach(() => {
        serverDescription.addRTTSample(1);
        serverDescription.addRTTSample(2);
      });

      it('properly calculates the average round trip time', function () {
        expect(serverDescription.roundTripTime).to.equal(1.5);
      });
    });
  });

  describe('minRoundTripTime()', function () {
    let serverDescription: ServerDescription;

    beforeEach(() => {
      serverDescription = new ServerDescription('localhost:27017');
    });

    context('when < 2 samples have been taken', function () {
      beforeEach(() => {
        serverDescription.addRTTSample(1);
      });

      it('returns 0', function () {
        expect(serverDescription.minRoundTripTime).to.equal(0);
      });
    });

    context('when exactly 2 samples have been taken', function () {
      beforeEach(() => {
        serverDescription.addRTTSample(1);
        serverDescription.addRTTSample(2);
      });

      it('properly computes minRoundTripTime', function () {
        expect(serverDescription.minRoundTripTime).to.equal(1);
      });
    });

    context('when > 2 samples have been taken', function () {
      beforeEach(() => {
        serverDescription.addRTTSample(1);
        serverDescription.addRTTSample(2);
        serverDescription.addRTTSample(3);
      });

      it('properly computes minRoundTripTime', function () {
        expect(serverDescription.minRoundTripTime).to.equal(1);
      });
    });
  });

  describe('addRTTSample()', function () {
    let serverDescription: ServerDescription;

    beforeEach(() => {
      serverDescription = new ServerDescription('localhost:27017');
      expect(serverDescription._rttSamples.length).to.equal(0);
    });

    context('when < 10 samples have been collected', function () {
      beforeEach(() => {
        serverDescription.addRTTSample(1);
        serverDescription.addRTTSample(2);
        serverDescription.addRTTSample(3);
      });

      it('adds new sample to end of list', function () {
        serverDescription.addRTTSample(4);
        expect(serverDescription._rttSamples.last()).to.equal(4);
      });
    });

    context('when 10 samples have been collected', function () {
      let i: number;

      beforeEach(() => {
        for (i = 1; i <= 10; i++) {
          serverDescription.addRTTSample(i);
        }
        expect(serverDescription._rttSamples.length).to.equal(10);
      });

      it('removes the first sample and then adds new sample to end of list', function () {
        serverDescription.addRTTSample(i);
        expect(serverDescription._rttSamples.length).to.equal(10);

        expect(serverDescription._rttSamples.first()).to.equal(2);
        expect(serverDescription._rttSamples.last()).to.equal(i);
      });
    });
  });
});
