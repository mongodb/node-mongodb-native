import { ObjectId } from 'bson';
import { expect } from 'chai';
import * as sinon from 'sinon';

import { MongoClient } from '../../../src/mongo_client';
import { type TopologyDescriptionChangedEvent } from '../../../src/sdam/events';
import { Server } from '../../../src/sdam/server';
import { ServerDescription } from '../../../src/sdam/server_description';
import { Topology } from '../../../src/sdam/topology';
import { type TopologyDescription } from '../../../src/sdam/topology_description';
import { fakeServer } from '../../tools/utils';

describe('Server Discovery and Monitoring', function () {
  let serverConnect: sinon.SinonStub;
  let topologySelectServer: sinon.SinonStub;
  let client: MongoClient;
  let events: TopologyDescriptionChangedEvent[];

  function getNewDescription() {
    const topologyDescriptionChanged = events[events.length - 1];
    return topologyDescriptionChanged.newDescription;
  }

  beforeEach(async function () {
    serverConnect = sinon.stub(Server.prototype, 'connect').callsFake(function () {
      this.s.state = 'connected';
      this.emit('connect');
    });

    topologySelectServer = sinon
      .stub(Topology.prototype, 'selectServer')
      .callsFake(async function (_selector, _options) {
        topologySelectServer.restore();
        return fakeServer();
      });

    events = [];
    client = new MongoClient('mongodb://a/?replicaSet=rs');
    client.on('topologyDescriptionChanged', event => events.push(event));
    await client.connect();

    // Start with a as primary
    client.topology.serverUpdateHandler(
      new ServerDescription('a:27017', {
        ok: 1,
        helloOk: true,
        isWritablePrimary: true,
        hosts: ['a:27017', 'b:27017'],
        setName: 'rs',
        setVersion: 1,
        electionId: ObjectId.createFromHexString('000000000000000000000001'),
        minWireVersion: 0,
        maxWireVersion: 21
      })
    );

    // b is elected as primary, a gets marked stale
    client.topology.serverUpdateHandler(
      new ServerDescription('b:27017', {
        ok: 1,
        helloOk: true,
        isWritablePrimary: true,
        hosts: ['a:27017', 'b:27017'],
        setName: 'rs',
        setVersion: 2,
        electionId: ObjectId.createFromHexString('000000000000000000000001'),
        minWireVersion: 0,
        maxWireVersion: 21
      })
    );
  });

  afterEach(async function () {
    serverConnect.restore();
    await client.close().catch(() => null);
  });

  let newDescription: TopologyDescription;

  describe('when a newer primary is detected', function () {
    it('steps down original primary to unknown server description with appropriate error message', function () {
      newDescription = getNewDescription();

      const aOutcome = newDescription.servers.get('a:27017');
      const bOutcome = newDescription.servers.get('b:27017');
      expect(aOutcome.type).to.equal('Unknown');
      expect(aOutcome.error).to.match(/primary marked stale due to discovery of newer primary/);

      expect(bOutcome.type).to.equal('RSPrimary');
    });
  });

  describe('when a stale primary still reports itself as primary', function () {
    it('gets marked as unknown with an error message with the new and old replicaSetVersion and electionId', function () {
      // a still incorrectly reports as primary
      client.topology.serverUpdateHandler(
        new ServerDescription('a:27017', {
          ok: 1,
          helloOk: true,
          isWritablePrimary: true,
          hosts: ['a:27017', 'b:27017'],
          setName: 'rs',
          setVersion: 1,
          electionId: ObjectId.createFromHexString('000000000000000000000001'),
          minWireVersion: 0,
          maxWireVersion: 21
        })
      );

      newDescription = getNewDescription();

      const aOutcome = newDescription.servers.get('a:27017');

      expect(aOutcome.type).to.equal('Unknown');
      expect(aOutcome.error).to.match(
        /primary marked stale due to electionId\/setVersion mismatch: server setVersion: \d+, server electionId: \d{24}, topology setVersion: \d+, topology electionId: \d{24}/
      );
    });
  });
});
