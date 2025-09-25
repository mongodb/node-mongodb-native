import { expect } from 'chai';

import { CursorResponse } from '../../../src/cmap/wire_protocol/responses';
import {
  AbstractCursor,
  type AbstractCursorOptions,
  type InitialCursorResponse
} from '../../../src/cursor/abstract_cursor';
import { MongoClient } from '../../../src/mongo_client';
import { type Server } from '../../../src/sdam/server';
import { type ClientSession } from '../../../src/sessions';
import { ns } from '../../../src/utils';

/** Minimal do nothing cursor to focus on testing the base cursor behavior */
class ConcreteCursor extends AbstractCursor {
  constructor(client: MongoClient, options: AbstractCursorOptions = {}) {
    super(client, ns('test.test'), options);
  }
  clone(): ConcreteCursor {
    return new ConcreteCursor(new MongoClient('mongodb://iLoveJavascript'));
  }
  async _initialize(session: ClientSession): Promise<InitialCursorResponse> {
    const response = CursorResponse.emptyGetMore;
    return { server: {} as Server, session, response };
  }
}

describe('class AbstractCursor', () => {
  let client: MongoClient;

  beforeEach(async function () {
    client = new MongoClient('mongodb://iLoveJavascript');
  });

  context('#constructor', () => {
    it('does not create a session if none passed in', () => {
      const cursor = new ConcreteCursor(client);
      expect(cursor).to.have.property('session').that.is.null;
    });

    it('uses the passed in session', async () => {
      const session = client.startSession();
      const cursor = new ConcreteCursor(client, { session });
      expect(cursor).to.have.property('session', session);
      await session.endSession();
    });
  });
});
