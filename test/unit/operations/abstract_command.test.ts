import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Callback,
  type ClientSession,
  CommandCallbackOperation,
  CommandOperation,
  type CommandOperationOptions,
  type OperationParent,
  Server,
  ServerDescription
} from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

class ConcreteCommand<T> extends CommandCallbackOperation<T> {
  constructor(parent?: OperationParent, options?: CommandOperationOptions) {
    super(parent, options);
  }

  protected executeCallback(
    server: Server,
    session: ClientSession | undefined,
    callback: Callback<any>
  ) {
    super.execute(server, session).then(
      res => callback(undefined, res),
      err => callback(err, undefined)
    );
  }
}

describe('class CommandOperation', () => {
  let server: Server;
  beforeEach(() => {
    server = new Server(
      topologyWithPlaceholderClient([], {} as any),
      new ServerDescription('a:1'),
      {} as any
    );
  });

  context('when an operation uses CommandCallbackOperation', () => {
    it('calls executeCommand when executeCommandCallback is invoked', done => {
      const operation = new ConcreteCommand<any>();
      const operationSpy = sinon.spy(CommandOperation.prototype, 'executeCommand');
      operation.executeCommandCallback(server, undefined, { ping: 1 }, () => {
        try {
          expect(operationSpy).to.have.been.calledOnceWithExactly(server, undefined, { ping: 1 });
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });
});
