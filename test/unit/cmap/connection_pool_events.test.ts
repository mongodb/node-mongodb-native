import { expect } from 'chai';

import { type ConnectionPool, ConnectionPoolCreatedEvent } from '../../mongodb';

describe('Connection Pool Events', function () {
  const connectionPoolMock = {
    address: 'localhost:9000',
    time: new Date()
  };

  describe('ConnectionPoolCreatedEvent', function () {
    describe('constructor', function () {
      describe('when provided expected option fields', function () {
        it(`Sets the allowed fields appropriately`, function () {
          const options = {
            maxIdleTimeMS: 0,
            maxConnecting: 2,
            minPoolSize: 0,
            maxPoolSize: 100,
            waitQueueTimeoutMS: 1000
          };
          const event = new ConnectionPoolCreatedEvent({
            ...connectionPoolMock,
            options
          } as unknown as ConnectionPool);
          expect(event).to.have.deep.property('options', options);
        });
      });

      describe('when provided unallowed fields', function () {
        it('only stores expected fields', function () {
          const options = {
            maxIdleTimeMS: 0,
            maxConnecting: 2,
            minPoolSize: 0,
            maxPoolSize: 100,
            waitQueueTimeoutMS: 1000,
            credentials: {
              user: 'user',
              pass: 'pass'
            },
            foo: 'foo',
            hello: 'world'
          };
          const event = new ConnectionPoolCreatedEvent({
            ...connectionPoolMock,
            options
          } as unknown as ConnectionPool);
          expect(event).to.have.deep.property('options', {
            maxIdleTimeMS: 0,
            maxConnecting: 2,
            minPoolSize: 0,
            maxPoolSize: 100,
            waitQueueTimeoutMS: 1000
          });
        });
      });
    });
  });
});
