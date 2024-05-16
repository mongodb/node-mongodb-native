import { expect } from 'chai';

import {
  isHello,
  MongoClient,
  MongoCredentials,
  MongoNetworkError,
  MongoRuntimeError
} from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';

describe('SCRAM Iterations Tests', function () {
  let server;
  let client: MongoClient;

  beforeEach(async () => {
    server = await mock.createServer();
    client = new MongoClient(`mongodb://${server.uri()}`);
  });

  afterEach(async () => {
    mock.cleanup();
    await client.close();
  });

  it('should error if iteration count is less than 4096', async function () {
    const scramResponse =
      'r=IE+xNFeOcslsupAA+zkDVzHd5HfwoRuP7Wi8S4py+erf8PcNm7XIdXQyT52Nj3+M,s=AzomrlMs99A7oFxDLpgFvVb+CSvdyXuNagoWVw==,i=4000';
    const credentials = new MongoCredentials({
      mechanism: 'DEFAULT',
      source: 'db',
      username: 'user',
      password: 'pencil',
      mechanismProperties: {}
    });
    client.s.options.credentials = credentials;
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        return request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.saslStart) {
        return request.reply({
          ok: 1,
          done: false,
          payload: Buffer.from(scramResponse)
        });
      } else if (doc.saslContinue) {
        throw new Error('should not be here');
      }
    });
    const thrownError = await client.connect().catch(error => error);
    expect(thrownError).to.be.instanceOf(MongoRuntimeError);
    expect(thrownError)
      .to.have.property('message')
      .that.matches(/Server returned an invalid iteration count/);
  });

  it('should error if server digest is invalid', async function () {
    const credentials = new MongoCredentials({
      mechanism: 'DEFAULT',
      source: 'db',
      username: 'user',
      password: 'pencil',
      mechanismProperties: {}
    });
    client.s.options.credentials = credentials;
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        return request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.saslStart) {
        return request.reply({
          ok: 1,
          done: false,
          payload: Buffer.from(
            'r=VNnXkRqKflB5+rmfnFiisCWzgDLzez02iRpbvE5mQjMvizb+VkSPRZZ/pDmFzLxq,s=dZTyOb+KZqoeTFdsULiqow==,i=10000'
          )
        });
      } else if (doc.saslContinue) {
        return request.reply({
          ok: 1,
          done: false,
          payload: Buffer.from('v=bWFsaWNpb3VzbWFsaWNpb3VzVzV')
        });
      }
    });
    const thrownError = await client.connect().catch(error => error);
    expect(thrownError).to.be.instanceOf(MongoRuntimeError);
    expect(thrownError)
      .to.have.property('message')
      .that.matches(/Server returned an invalid signature/);
  });

  it('should properly handle network errors on `saslContinue`', async function () {
    const credentials = new MongoCredentials({
      mechanism: 'DEFAULT',
      source: 'db',
      username: 'user',
      password: 'pencil',
      mechanismProperties: {}
    });
    client.s.options.credentials = credentials;
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        return request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.saslStart) {
        return request.reply({
          ok: 1,
          done: false,
          payload: Buffer.from(
            'r=VNnXkRqKflB5+rmfnFiisCWzgDLzez02iRpbvE5mQjMvizb+VkSPRZZ/pDmFzLxq,s=dZTyOb+KZqoeTFdsULiqow==,i=10000'
          )
        });
      } else if (doc.saslContinue) {
        request.connection.destroy();
      }
    });
    const thrownError = await client.connect().catch(error => error);
    expect(thrownError).to.be.instanceOf(MongoNetworkError);
    expect(thrownError)
      .to.have.property('message')
      .that.matches(/connection(.+)closed/);
  });

  it('should preserve trailing "=" from saslStart responses that are passed to saslContinue', async function () {
    const credentials = new MongoCredentials({
      mechanism: 'DEFAULT',
      source: 'db',
      username: 'user',
      password: 'pencil',
      mechanismProperties: {}
    });
    let payload;
    client.s.options.credentials = credentials;
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        return request.reply(Object.assign({}, mock.HELLO));
      } else if (doc.saslStart) {
        return request.reply({
          ok: 1,
          done: false,
          payload: Buffer.from(
            'n=__system,r=r7RuW8nC89hmrlIPSpatiEGnZGkuGcsq,r=r7RuW8nC89hmrlIPSpatiEGnZGkuGcsquPuvfddlU3NavdfJxv/XKg==,s=b7rCae/2BRjlcsn93RoUOfqtiwaf0nrXvSKLdQ==,i=15000'
          )
        });
      } else if (doc.saslContinue) {
        payload = doc.payload.toString('utf8');
        request.connection.destroy();
      }
    });
    await client.connect().catch(error => error);
    expect(payload).to.includes('r=r7RuW8nC89hmrlIPSpatiEGnZGkuGcsquPuvfddlU3NavdfJxv/XKg==');
  });
});
