import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  type Callback,
  type ClientSession,
  CommandCallbackOperation,
  type CommandOperationOptions,
  type Document,
  type OperationParent,
  Server,
  ServerDescription
} from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

class ConcreteCommand<T> extends CommandCallbackOperation<T> {
  constructor(parent?: OperationParent, options?: CommandOperationOptions) {
    super(parent, options);
  }

  async executeCommand(
    server: Server,
    session: ClientSession | undefined,
    cmd: Document
  ): Promise<any> {
    return super.executeCommand(server, session, cmd);
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

  context('when a server is created', () => {
    it('calls executeCommand, which calls server.commandAsync, when executeCommandCallback is invoked', async () => {
      const operation = new ConcreteCommand<any>();
      const serverSpy = sinon.stub(server, 'commandAsync');
      operation.executeCommandCallback(server, undefined, { ping: 1 }, (err, res) => {
        err ? err : res;
      });
      expect(serverSpy).to.have.been.calledOnce;
    });
  });
});
