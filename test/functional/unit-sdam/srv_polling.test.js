'use strict';

const { Topology } = require('../../../src/sdam/topology');
const { TopologyDescription } = require('../../../src/sdam/topology_description');
const { TopologyType } = require('../../../src/sdam/common');
const { SrvPoller, SrvPollingEvent } = require('../../../src/sdam/srv_polling');
const sdamEvents = require('../../../src/sdam/events');

const dns = require('dns');
const EventEmitter = require('events').EventEmitter;
const chai = require('chai');
const sinon = require('sinon');
const mock = require('../../tools/mock');
const { HostAddress } = require('../../../src/utils');
const { MongoDriverError } = require('../../../src/error');

const expect = chai.expect;
chai.use(require('sinon-chai'));

describe('Mongos SRV Polling', function () {
  const context = {};
  const SRV_HOST = 'darmok.tanagra.com';

  function srvRecord(mockServer, port) {
    if (typeof mockServer === 'string') {
      mockServer = { host: mockServer, port };
    }
    return {
      priority: 0,
      weight: 0,
      port: mockServer.port,
      name: mockServer.host
    };
  }

  function tryDone(done, handle) {
    process.nextTick(() => {
      try {
        handle();
        done();
      } catch (e) {
        done(e);
      }
    });
  }

  function stubDns(err, records) {
    context.sinon.stub(dns, 'resolveSrv').callsFake(function (_srvAddress, callback) {
      process.nextTick(() => callback(err, records));
    });
  }

  before(function () {
    context.sinon = sinon.createSandbox();
  });

  afterEach(function () {
    context.sinon.restore();
  });

  after(function () {
    delete context.sinon;
  });

  describe('SrvPoller', function () {
    function stubPoller(poller) {
      context.sinon.stub(poller, 'success');
      context.sinon.stub(poller, 'failure');
      context.sinon.stub(poller, 'parentDomainMismatch');
    }

    it('should always return a valid value for `intervalMS`', function () {
      const poller = new SrvPoller({ srvHost: SRV_HOST });
      expect(poller).property('intervalMS').to.equal(60000);
    });

    describe('success', function () {
      it('should emit event, disable haMode, and schedule another poll', function (done) {
        const records = [srvRecord('jalad.tanagra.com'), srvRecord('thebeast.tanagra.com')];
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        context.sinon.stub(poller, 'schedule');

        poller.haMode = true;
        expect(poller).to.have.property('haMode', true);

        poller.once('srvRecordDiscovery', e => {
          tryDone(done, () => {
            expect(e)
              .to.be.an.instanceOf(SrvPollingEvent)
              .and.to.have.property('srvRecords')
              .that.deep.equals(records);
            expect(poller.schedule).to.have.been.calledOnce;
            expect(poller).to.have.property('haMode', false);
          });
        });

        poller.success(records);
      });
    });

    describe('failure', function () {
      it('should enable haMode and schedule', function () {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        context.sinon.stub(poller, 'schedule');
        poller.failure('Some kind of failure');

        expect(poller.schedule).to.have.been.calledOnce;
        expect(poller).to.have.property('haMode', true);
      });
    });

    describe('poll', function () {
      it('should throw if srvHost is not passed in', function () {
        expect(() => new SrvPoller()).to.throw(MongoDriverError);
        expect(() => new SrvPoller({})).to.throw(MongoDriverError);
      });

      it('should poll dns srv records', function () {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        context.sinon.stub(dns, 'resolveSrv');

        poller._poll();

        expect(dns.resolveSrv).to.have.been.calledOnce.and.to.have.been.calledWith(
          `_mongodb._tcp.${SRV_HOST}`,
          sinon.match.func
        );
      });

      it('should not succeed or fail if poller was stopped', function (done) {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        stubDns(null, []);
        stubPoller(poller);

        poller._poll();
        poller.generation += 1;

        tryDone(done, () => {
          expect(poller.success).to.not.have.been.called;
          expect(poller.failure).to.not.have.been.called;
          expect(poller.parentDomainMismatch).to.not.have.been.called;
        });
      });

      it('should fail if dns returns error', function (done) {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        stubDns(new Error('Some Error'));
        stubPoller(poller);

        poller._poll();

        tryDone(done, () => {
          expect(poller.success).to.not.have.been.called;
          expect(poller.failure).to.have.been.calledOnce.and.calledWith('DNS error');
          expect(poller.parentDomainMismatch).to.not.have.been.called;
        });
      });

      it('should fail if dns returns no records', function (done) {
        const poller = new SrvPoller({ srvHost: SRV_HOST });

        stubDns(null, []);
        stubPoller(poller);

        poller._poll();

        tryDone(done, () => {
          expect(poller.success).to.not.have.been.called;
          expect(poller.failure).to.have.been.calledOnce.and.calledWith(
            'No valid addresses found at host'
          );
          expect(poller.parentDomainMismatch).to.not.have.been.called;
        });
      });

      it('should fail if dns returns no records that match parent domain', function (done) {
        const poller = new SrvPoller({ srvHost: SRV_HOST });
        const records = [srvRecord('jalad.tanagra.org'), srvRecord('shaka.walls.com')];

        stubDns(null, records);
        stubPoller(poller);

        poller._poll();

        tryDone(done, () => {
          expect(poller.success).to.not.have.been.called;
          expect(poller.failure).to.have.been.calledOnce.and.calledWith(
            'No valid addresses found at host'
          );
          expect(poller.parentDomainMismatch)
            .to.have.been.calledTwice.and.calledWith(records[0])
            .and.calledWith(records[1]);
        });
      });

      it('should succeed when valid records are returned by dns', function (done) {
        const poller = new SrvPoller({ srvHost: SRV_HOST });
        const records = [srvRecord('jalad.tanagra.com'), srvRecord('thebeast.tanagra.com')];

        stubDns(null, records);
        stubPoller(poller);

        poller._poll();

        tryDone(done, () => {
          expect(poller.success).to.have.been.calledOnce.and.calledWithMatch(records);
          expect(poller.failure).to.not.have.been.called;
          expect(poller.parentDomainMismatch).to.not.have.been.called;
        });
      });

      it('should succeed when some valid records are returned and some do not match parent domain', function (done) {
        const poller = new SrvPoller({ srvHost: SRV_HOST });
        const records = [srvRecord('jalad.tanagra.com'), srvRecord('thebeast.walls.com')];

        stubDns(null, records);
        stubPoller(poller);

        poller._poll();

        tryDone(done, () => {
          expect(poller.success).to.have.been.calledOnce.and.calledWithMatch([records[0]]);
          expect(poller.failure).to.not.have.been.called;
          expect(poller.parentDomainMismatch).to.have.been.calledOnce.and.calledWith(records[1]);
        });
      });
    });
  });

  describe('topology', function () {
    class FakeSrvPoller extends EventEmitter {
      start() {}
      stop() {}
      trigger(srvRecords) {
        this.emit('srvRecordDiscovery', new SrvPollingEvent(srvRecords));
      }
    }

    it('should not make an srv poller if there is no srv host', function () {
      const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST });

      const topology = new Topology(['localhost:27017', 'localhost:27018'], {
        srvPoller
      });

      expect(topology).to.not.have.property('srvPoller');
    });

    it('should make an srvPoller if there is an srvHost', function () {
      const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST });

      const topology = new Topology(['localhost:27017', 'localhost:27018'], {
        srvHost: SRV_HOST,
        srvPoller
      });

      expect(topology.s).to.have.property('srvPoller').that.equals(srvPoller);
    });

    it('should only start polling if topology description changes to sharded', function () {
      const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST });
      sinon.stub(srvPoller, 'start');

      const topology = new Topology(['localhost:27017', 'localhost:27018'], {
        srvHost: SRV_HOST,
        srvPoller
      });

      const topologyDescriptions = [
        new TopologyDescription(TopologyType.Unknown),
        new TopologyDescription(TopologyType.Unknown),
        new TopologyDescription(TopologyType.Sharded),
        new TopologyDescription(TopologyType.Sharded)
      ];

      function emit(prev, current) {
        topology.emit(
          'topologyDescriptionChanged',
          new sdamEvents.TopologyDescriptionChangedEvent(topology.s.id, prev, current)
        );
      }

      expect(srvPoller.start).to.not.have.been.called;
      emit(topologyDescriptions[0], topologyDescriptions[1]);
      expect(srvPoller.start).to.not.have.been.called;
      emit(topologyDescriptions[1], topologyDescriptions[2]);
      expect(srvPoller.start).to.have.been.calledOnce;
      emit(topologyDescriptions[2], topologyDescriptions[3]);
      expect(srvPoller.start).to.have.been.calledOnce;
    });

    describe('prose tests', function () {
      function srvAddresses(records) {
        return records.map(r => `${r.name}:${r.port}`);
      }

      const MONGOS_DEFAULT_ISMASTER = Object.assign({}, mock.DEFAULT_ISMASTER_36, {
        msg: 'isdbgrid'
      });

      beforeEach(function () {
        return Promise.all(Array.from({ length: 4 }).map(() => mock.createServer())).then(
          servers => {
            context.servers = servers;
          }
        );
      });

      afterEach(function () {
        return mock.cleanup();
      });

      afterEach(function (done) {
        if (context.topology) {
          context.topology.close(done);
        } else {
          done();
        }
      });

      function runSrvPollerTest(recordSets, done) {
        context.servers.forEach(server => {
          server.setMessageHandler(request => {
            const doc = request.document;

            if (doc.ismaster || doc.hello) {
              request.reply(Object.assign({}, MONGOS_DEFAULT_ISMASTER));
            }
          });
        });

        const srvPoller = new FakeSrvPoller({ srvHost: SRV_HOST });
        const seedlist = recordSets[0].map(record =>
          HostAddress.fromString(`${record.name}:${record.port}`)
        );

        context.topology = new Topology(seedlist, { srvPoller, srvHost: SRV_HOST });
        const topology = context.topology;

        topology.connect({}, err => {
          if (err) {
            return done(err);
          }

          try {
            expect(topology.description).to.have.property('type', TopologyType.Sharded);
            const servers = Array.from(topology.description.servers.keys());

            expect(servers).to.deep.equal(srvAddresses(recordSets[0]));

            topology.once('topologyDescriptionChanged', function () {
              tryDone(done, function () {
                const servers = Array.from(topology.description.servers.keys());

                expect(servers).to.deep.equal(srvAddresses(recordSets[1]));
              });
            });

            process.nextTick(() => srvPoller.trigger(recordSets[1]));
          } catch (e) {
            done(e);
          }
        });
      }

      // The addition of a new DNS record:
      // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
      it('should handle the addition of a new DNS record', function (done) {
        const recordSets = [
          [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
          [
            srvRecord(context.servers[0]),
            srvRecord(context.servers[1]),
            srvRecord(context.servers[2])
          ]
        ];
        runSrvPollerTest(recordSets, done);
      });

      // The removal of an existing DNS record:
      // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27018  localhost.test.build.10gen.cc.
      it('should handle the removal of an existing DNS record', function (done) {
        const recordSets = [
          [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
          [srvRecord(context.servers[0])]
        ];
        runSrvPollerTest(recordSets, done);
      });

      // The replacement of a DNS record:
      // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27018  localhost.test.build.10gen.cc.
      // replace by:
      // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
      it('should handle the replacement of a DNS record', function (done) {
        const recordSets = [
          [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
          [srvRecord(context.servers[0]), srvRecord(context.servers[2])]
        ];
        runSrvPollerTest(recordSets, done);
      });

      // The replacement of both existing DNS records with one new record:
      // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
      it('should handle the replacement of both existing DNS records with one new record', function (done) {
        const recordSets = [
          [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
          [srvRecord(context.servers[2])]
        ];
        runSrvPollerTest(recordSets, done);
      });

      // The replacement of both existing DNS records with two new records:
      // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27019  localhost.test.build.10gen.cc.
      // _mongodb._tcp.test1.test.build.10gen.cc.  86400  IN SRV  27020  localhost.test.build.10gen.cc.
      it('should handle the replacement of both existing DNS records with two new records', function (done) {
        const recordSets = [
          [srvRecord(context.servers[0]), srvRecord(context.servers[1])],
          [srvRecord(context.servers[2]), srvRecord(context.servers[3])]
        ];
        runSrvPollerTest(recordSets, done);
      });
    });
  });
});
