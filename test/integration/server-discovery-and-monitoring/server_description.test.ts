import { type ChildProcess, spawn } from 'node:child_process';

import { expect } from 'chai';

import { MongoClient } from '../../mongodb';

describe('class ServerDescription', function () {
  describe('when connecting to mongocryptd', { requires: { mongodb: '>=4.4' } }, function () {
    let client: MongoClient;
    const mongocryptdTestPort = '27022';
    let childProcess: ChildProcess;

    beforeEach(async function () {
      childProcess = spawn('mongocryptd', ['--port', mongocryptdTestPort, '--ipv6'], {
        stdio: 'ignore',
        detached: true
      });

      childProcess.on('error', error => console.warn(this.currentTest?.fullTitle(), error));
      client = new MongoClient(`mongodb://localhost:${mongocryptdTestPort}`);
    });

    afterEach(async function () {
      await client?.close();
      childProcess.kill('SIGKILL');
    });

    it('iscryptd is set to true ', async function () {
      const descriptions = [];
      client.on('serverDescriptionChanged', description => descriptions.push(description));
      const hello = await client.db().command({ hello: true });
      expect(hello).to.have.property('iscryptd', true);
      expect(descriptions.at(-1)).to.have.nested.property('newDescription.iscryptd', true);
    });
  });

  describe('when connecting to anything other than mongocryptd', function () {
    let client: MongoClient;

    beforeEach(async function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      await client?.close();
    });

    it('iscryptd is set to false ', async function () {
      const descriptions = [];
      client.on('serverDescriptionChanged', description => descriptions.push(description));
      const hello = await client.db().command({ hello: true });
      expect(hello).to.not.have.property('iscryptd');
      expect(descriptions.at(-1)).to.have.nested.property('newDescription.iscryptd', false);
    });
  });
});
