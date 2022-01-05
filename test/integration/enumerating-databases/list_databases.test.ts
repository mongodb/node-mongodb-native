describe('listDatabases - authorizedDatabases', function () {
  const username = 'newUser';
  const password = 'newUserPw';
  let client;
  let newClient;
  const mockRoles = { roles: [{ role: 'read', db: 'mockAuthorizedDb' }] };

  before(async function () {
    client = this.configuration.newClient();
    await client.connect();
    await client.db('admin').addUser(username, password, mockRoles);

    newClient = this.configuration.newClient({ auth: { username, password } });
    await newClient.connect();
  });

  // after(async function () {
  //   await client.db('admin').removeUser(username, mockRoles);
  // });

  it.only('@TEMP: should correctly show authorized databases', async function () {
    await newClient.db().admin().listDatabases();
    await newClient.db().admin().command({ connectionStatus: 1 });

    await client.db('admin').removeUser(username, mockRoles);
    await client.close();
    await newClient.close();
  });
});
