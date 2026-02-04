/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ObjectId } from 'bson';
import { expect } from 'chai';
import { once } from 'events';
import * as sinon from 'sinon';

import {
  MongoError,
  MongoErrorLabel,
  MongoNetworkError,
  MongoNetworkTimeoutError
} from '../../mongodb';
import {
  type Connection,
  Server,
  ServerDescription,
  ServerType,
  TopologyType
} from '../../mongodb';
import { sleep, topologyWithPlaceholderClient } from '../../tools/utils';

const handledErrors = [
  {
    description: 'any non-timeout network error',
    errorClass: MongoNetworkError,
    errorArgs: ['TestError']
  },
  {
    description: 'a network timeout error before handshake',
    errorClass: MongoNetworkTimeoutError,
    errorArgs: ['TestError', { beforeHandshake: true }]
  },
  {
    description: 'an auth handshake error',
    errorClass: MongoError,
    errorArgs: ['TestError'],
    errorLabel: MongoErrorLabel.HandshakeError
  }
];

const unhandledErrors = [
  {
    description: 'a non-MongoError',
    errorClass: Error,
    errorArgs: ['TestError']
  },
  {
    description: 'a network timeout error after handshake',
    errorClass: MongoNetworkTimeoutError,
    errorArgs: ['TestError', { beforeHandshake: false }]
  },
  {
    description: 'a non-network non-handshake MongoError',
    errorClass: MongoError,
    errorArgs: ['TestError']
  }
];

describe('Server', () => {
  describe('#handleError', () => {
    let server: Server, connection: Connection | undefined;

    beforeEach(() => {
      server = new Server(
        topologyWithPlaceholderClient([], {}),
        new ServerDescription('a:1'),
        {} as any
      );
    });

    for (const loadBalanced of [true, false]) {
      const mode = loadBalanced ? 'loadBalanced' : 'non-loadBalanced';
      const contextSuffix = loadBalanced ? ' with connection provided' : '';
      context(`in ${mode} mode${contextSuffix}`, () => {
        beforeEach(() => {
          if (loadBalanced) {
            server.topology.description.type = TopologyType.LoadBalanced;
            connection = { serviceId: new ObjectId() } as Connection;
            server.pool.clear = sinon.stub();
          } else {
            connection = undefined;
          }
        });
        for (const { description, errorClass, errorArgs, errorLabel } of handledErrors) {
          const handledDescription = loadBalanced
            ? `should reset the pool but not attach a ResetPool label to the error or mark the server unknown on ${description}`
            : `should attach a ResetPool label to the error and mark the server unknown on ${description}`;
          it(`${handledDescription}`, async () => {
            // @ts-expect-error because of varied number of args
            const error = new errorClass(...errorArgs);
            if (errorLabel) {
              error.addErrorLabel(errorLabel);
            }
            const newDescriptionEvent = Promise.race([
              once(server, Server.DESCRIPTION_RECEIVED),
              sleep(1000)
            ]);
            server.handleError(error, connection);
            if (!loadBalanced) {
              expect(
                error.hasErrorLabel(MongoErrorLabel.ResetPool),
                'expected error to have a ResetPool label'
              ).to.be.true;
            } else {
              expect(
                error.hasErrorLabel(MongoErrorLabel.ResetPool),
                'expected error NOT to have a ResetPool label'
              ).to.be.false;
            }
            const newDescription = await newDescriptionEvent;
            if (!loadBalanced) {
              expect(newDescription).to.have.nested.property('[0].type', ServerType.Unknown);
            } else {
              expect(newDescription).to.be.undefined;
              expect(server.pool.clear).to.have.been.calledOnceWith({
                serviceId: connection!.serviceId
              });
            }
          });

          it(`should not attach a ResetPool label to the error or mark the server unknown on ${description} if it is stale`, async () => {
            // @ts-expect-error because of varied number of args
            const error = new errorClass(...errorArgs);
            if (errorLabel) {
              error.addErrorLabel(errorLabel);
            }

            error.connectionGeneration = -1;
            expect(
              server.pool.generation,
              'expected test server to have a pool of generation 0'
            ).to.equal(0); // sanity check

            const newDescriptionEvent = Promise.race([
              once(server, Server.DESCRIPTION_RECEIVED),
              sleep(1000)
            ]);
            server.handleError(error, connection);
            expect(
              error.hasErrorLabel(MongoErrorLabel.ResetPool),
              'expected error NOT to have a ResetPool label'
            ).to.be.false;
            const newDescription = await newDescriptionEvent;
            expect(newDescription).to.be.undefined;
          });
        }

        for (const { description, errorClass, errorArgs } of unhandledErrors) {
          it(`should not attach a ResetPool label to the error or mark the server unknown on ${description}`, async () => {
            // @ts-expect-error because of varied number of args
            const error = new errorClass(...errorArgs);

            const newDescriptionEvent = Promise.race([
              once(server, Server.DESCRIPTION_RECEIVED),
              sleep(1000)
            ]);
            server.handleError(error, connection);
            if (error instanceof MongoError) {
              expect(
                error.hasErrorLabel(MongoErrorLabel.ResetPool),
                'expected error NOT to have a ResetPool label'
              ).to.be.false;
            }
            const newDescription = await newDescriptionEvent;
            expect(newDescription).to.be.undefined;
          });
        }
      });
    }
  });
});
