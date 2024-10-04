import { expect } from 'chai';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';
import { TLSSocket } from 'tls';
import { promisify } from 'util';

import { MongoClient } from '../../mongodb';
import { getEncryptExtraOptions } from '../../tools/utils';
import { createTimerSandbox } from '../../unit/timer_sandbox';

describe('Auto Encryption (Integration)', function () {
  describe.skip('CSOT', function () {
    let client;
    let clock;
    let timerSandbox;
    let sleep;

    const getKmsProviders = () => {
      const my_key = Buffer.from(
        'Mng0NCt4ZHVUYUJCa1kxNkVyNUR1QURhZ2h2UzR2d2RrZzh0cFBwM3R6NmdWMDFBMUN3YkQ5aXRRMkhGRGdQV09wOGVNYUMxT2k3NjZKelhaQmRCZGJkTXVyZG9uSjFk',
        'base64'
      );
      return { local: { key: my_key } };
    };
    const keyVaultNamespace = 'keyvault.datakeys';

    afterEach(async function () {
      await client?.close();
    });

    context('when client is provided timeoutContext', function () {
      it('should time out command sent through after timeoutMS', async function () {
        client = new MongoClient('mongodb://localhost:27017', {
          autoEncryption: {
            keyVaultNamespace,
            kmsProviders: getKmsProviders(),
            extraOptions: getEncryptExtraOptions()
          },
          timeoutMS: 10000
        });
        await client.connect();

        const err$ = await client
          .db('test')
          .command({ ping: 1 })
          .catch(e => e);
        const err = err$;
        console.log(err);
      });
    });

    context('when client is not provided timeoutContext', function () {
      beforeEach(async function () {
        sinon.stub(TLSSocket.prototype, 'connect').callsFake(function (..._args) {
          clock.tick(30000);
        });
        timerSandbox = createTimerSandbox();
        clock = sinon.useFakeTimers();
        sleep = promisify(setTimeout);
      });

      afterEach(async function () {
        if (clock) {
          timerSandbox.restore();
          clock.restore();
          clock = undefined;
        }
        sinon.restore();
      });

      it('should not timeout the command sent through autoEncryption after timeoutMS', async function () {
        client = this.configuration.newClient(
          {},
          {
            autoEncryption: {
              keyVaultNamespace,
              kmsProviders: getKmsProviders(),
              extraOptions: getEncryptExtraOptions()
            }
          }
        );

        const sleepingFn = async () => {
          await sleep(30000);
          throw Error('Slept for 30s');
        };

        const err$ = Promise.all([
          client.db('test').collection('test').insert({ a: 1 }),
          sleepingFn()
        ]).catch(e => e);
        clock.tick(30000);
        const err = await err$;
        expect(err.message).to.equal('Slept for 30s');
      });
    });
  });
});
