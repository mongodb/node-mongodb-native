import { expect } from 'chai';
import { type TopologyDescription } from 'mongodb-legacy';
import * as sinon from 'sinon';

import {
  type MongoClient,
  ObjectId,
  Server,
  ServerDescription,
  Topology,
  TOPOLOGY_DESCRIPTION_CHANGED,
  type TopologyDescriptionChangedEvent
} from '../../mongodb';

const SDAM_EVENTS = [
  // Topology events
  TOPOLOGY_DESCRIPTION_CHANGED
];

describe('Server Discovery and Monitoring', function () {
  let serverConnect: sinon.SinonStub;
  let topologySelectServer: sinon.SinonStub;
  let client: MongoClient;
  let events: TopologyDescriptionChangedEvent[] = [];

  function getNewDescription() {
    const [topologyDescriptionChanged] = events.filter(
      x => x.name === 'topologyDescriptionChanged'
    );
    events = [];
    return topologyDescriptionChanged.newDescription;
  }

  before(async function () {
    serverConnect = sinon.stub(Server.prototype, 'connect').callsFake(function () {
      this.s.state = 'connected';
      this.emit('connect');
    });
    topologySelectServer = sinon
      .stub(Topology.prototype, 'selectServer')
      .callsFake(async function (_selector, _options) {
        topologySelectServer.restore();

        const fakeServer = { s: { state: 'connected' }, removeListener: () => true };
        return fakeServer;
      });
    const events = [];
    client.on('topologyDescriptionChanged', event => events.push(event));
    await client.connect();
  });

  after(function () {
    serverConnect.restore();
  });

  describe('when a newer primary is detected', function () {
    it('steps down original primary to unknown server description with appropriate error message', async function () {
      let newDescription: TopologyDescription;
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

      newDescription = getNewDescription();

      expect(newDescription.type).to.equal('ReplicaSetWithPrimary');

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

      newDescription = getNewDescription();

      let aOutcome = newDescription.servers.get('a:27017');
      expect(aOutcome.error).to.match(/primary marked stale due to discovery of newer primary/);

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

      aOutcome = newDescription.servers.get('a:27017');

      expect(aOutcome.type).to.equal('Unknown');
      expect(aOutcome.error).to.match(
        /primary marked stale due to electionId\/setVersion mismatch: server setVersion: \d+, server electionId: \d{24}, topology setVersion: \d, topology electionId: \d{24}/
      );
    });
  });
});
