import { AddUserOptions, MongoClient } from '../../../src';

describe('listDatabases - authorizedDatabases', function () {
  const username = 'newUser';
  const password = 'newUserPw';
  let client: MongoClient;
  let newClient: MongoClient;
  const userOptions: AddUserOptions = { roles: [{ role: 'read', db: 'mockAuthorizedDb' }] };

  before(async function () {
    client = this.configuration.newClient();
    await client.connect();
    await client.db('admin').addUser(username, password, userOptions);

    newClient = this.configuration.newClient({ auth: { username, password } });
    await newClient.connect();
  });

  afterEach(async function () {
    await client.db('admin').removeUser(username);
    await client.close();
    await newClient.close();
  });

  it.only('@TEMP: should correctly show authorized databases', async function () {
    const dbs = await newClient.db().admin().listDatabases();
    const status = await newClient.db().admin().command({ connectionStatus: 1 });
    const authorized = await newClient.db().admin().listDatabases({ authorizedDatabases: true });
    //do someting
  });
});
