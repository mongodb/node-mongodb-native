import { expect } from 'chai';
import * as os from 'os';
import * as sinon from 'sinon';

import { Topology } from '../../../src/sdam/topology';

describe('URI', function () {
  let client;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  it('should correctly allow for w:0 overriding on the connect url', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: async function () {
      const authInformation = process.env.AUTH === 'auth' ? 'bob:pwd123@' : '';
      // Connect using the connection string
      const client = this.configuration.newClient(
        `mongodb://${authInformation}localhost:27017/?w=0`
      );

      await client.connect();
      const db = client.db(this.configuration.db);

      const result = await db
        .collection('mongoclient_test')
        .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true });

      expect(result).to.exist;
      expect(result).property('acknowledged').to.be.false;
      await client.close();
    }
  });

  it('should correctly connect via domain socket', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: async function () {
      if (os.platform() === 'win32') {
        return;
      }

      const client = this.configuration.newClient('mongodb://%2Ftmp%2Fmongodb-27017.sock');
      await client.connect();
      const err = await client.close().catch(e => e);
      expect(err).to.not.exist;
    }
  });

  it('should correctly connect via normal url using ip', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: async function () {
      const client = this.configuration.newClient('mongodb://127.0.0.1:27017/?fsync=true');
      await client.connect();
      const db = client.db(this.configuration.db);
      expect(db.writeConcern.journal).to.be.true;
      await client.close();
    }
  });

  context('when connecting with a username and password that have URI escapable characters', () => {
    let utilClient;
    let client;
    const username = 'u$ser';
    const password = '$specialch@rs';

    beforeEach(async function () {
      utilClient = this.configuration.newClient();
      await utilClient.db().admin().command({ createUser: username, pwd: password, roles: [] });
    });

    afterEach(async () => {
      await utilClient.db().admin().command({ dropUser: username });
      await client?.close();
      await utilClient?.close();
    });

    it(
      'accepts a client that provides the correct username and password',
      { requires: { topology: 'single' } },
      async function () {
        const mongodbUri = `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(
          password
        )}@${this.configuration.options.host}`;
        client = this.configuration.newClient(mongodbUri);
        await client.connect();
      }
    );
  });

  it('should correctly translate uri options', {
    metadata: { requires: { topology: 'replicaset' } },
    test: async function () {
      const config = this.configuration;
      const uri = `mongodb://${config.host}:${config.port}/${config.db}?replicaSet=${config.replicasetName}`;

      const client = this.configuration.newClient(uri);
      await client.connect();
      expect(client).to.exist;
      expect(client.options.replicaSet).to.exist.and.equal(config.replicasetName);
      await client.close();
    }
  });

  it('should generate valid credentials with X509', {
    metadata: { requires: { topology: 'single' } },
    test: function () {
      async function validateConnect(options) {
        expect(options).to.have.property('credentials');
        expect(options.credentials.mechanism).to.eql('MONGODB-X509');

        connectStub.restore();
        return undefined;
      }

      const topologyPrototype = Topology.prototype;
      const connectStub = sinon.stub(topologyPrototype, 'connect').callsFake(validateConnect);
      const uri = 'mongodb://some-hostname/test?ssl=true&authMechanism=MONGODB-X509&replicaSet=rs0';
      const client = this.configuration.newClient(uri);
      return client.connect().finally(() => client.close());
    }
  });
});
