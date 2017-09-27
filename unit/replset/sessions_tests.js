'use strict';
var expect = require('chai').expect,
  ReplSet = require('../../../../lib/topologies/replset'),
  mock = require('../../../mock'),
  genClusterTime = require('../common').genClusterTime,
  ReplSetFixture = require('../common').ReplSetFixture;

const test = new ReplSetFixture();
describe('Sessions (ReplSet)', function() {
  describe('$clusterTime', function() {
    afterEach(() => mock.cleanup());
    beforeEach(() => test.setup());

    it('should track the highest `clusterTime` seen in a replica set', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const clusterTime = genClusterTime(Date.now()),
          futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

        test.primaryStates[0].$clusterTime = clusterTime;
        test.firstSecondaryStates[0].$clusterTime = futureClusterTime;
        test.arbiterStates[0].$clusterTime = futureClusterTime;

        var replset = new ReplSet(
          [test.primaryServer.address(), test.firstSecondaryServer.address()],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 100,
            size: 1
          }
        );

        let serverCount = 0;
        replset.on('joined', () => {
          serverCount++;
          if (serverCount === 3) {
            expect(replset.clusterTime).to.eql(futureClusterTime);
            replset.destroy();
            done();
          }
        });

        replset.on('error', done);
        replset.connect();
      }
    });
  });
});
