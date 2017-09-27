'use strict';
var Server = require('../../../../lib/topologies/server'),
  expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  mock = require('../../../mock'),
  genClusterTime = require('../common').genClusterTime;

const test = {};
describe('Sessions (Single)', function() {
  describe('$clusterTime', function() {
    afterEach(() => mock.cleanup());
    beforeEach(() => {
      return mock.createServer(37019, 'localhost').then(mockServer => {
        test.server = mockServer;
      });
    });

    it('should recognize and set `clusterTime` on the topology', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const clusterTime = genClusterTime(Date.now());
        test.server.setMessageHandler(request => {
          request.reply(
            assign({}, mock.DEFAULT_ISMASTER, {
              $clusterTime: clusterTime
            })
          );
        });

        const client = new Server({ host: test.server.host, port: test.server.port });
        client.on('error', done);
        client.once('connect', () => {
          expect(client.clusterTime).to.eql(clusterTime);
          client.destroy();
          done();
        });

        client.connect();
      }
    });

    it('should track the highest `$clusterTime` seen', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const clusterTime = genClusterTime(Date.now()),
          futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

        test.server.setMessageHandler(request => {
          const doc = request.document;
          if (doc.ismaster) {
            request.reply(
              assign({}, mock.DEFAULT_ISMASTER, {
                $clusterTime: clusterTime
              })
            );
          } else if (doc.insert) {
            request.reply({
              ok: 1,
              n: [],
              lastOp: new Date(),
              $clusterTime: futureClusterTime
            });
          }
        });

        const client = new Server({ host: test.server.host, port: test.server.port });
        client.on('error', done);
        client.once('connect', () => {
          expect(client.clusterTime).to.exist;
          expect(client.clusterTime).to.eql(clusterTime);

          client.insert('test.test', [{ created: new Date() }], function(err) {
            expect(err).to.not.exist;
            expect(client.clusterTime).to.exist;
            expect(client.clusterTime).to.not.eql(clusterTime);
            expect(client.clusterTime).to.eql(futureClusterTime);

            client.destroy();
            done();
          });
        });

        client.connect();
      }
    });
  });
});
