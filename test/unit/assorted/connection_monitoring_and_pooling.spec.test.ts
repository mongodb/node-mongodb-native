import { HostAddress } from '../../../src';
import { isHello } from '../../../src/utils';
import { loadSpecTests } from '../../spec';
import { CmapTest, runCmapTest, ThreadContext } from '../../tools/cmap_spec_runner';
import * as mock from '../../tools/mongodb-mock/index';

describe('Connection Monitoring and Pooling Spec Tests', function () {
  let hostAddress: HostAddress, threadContext: ThreadContext;
  after(() => mock.cleanup());
  before(async () => {
    const server = await mock.createServer();
    // we aren't testing errors yet, so it's fine for the mock server to just accept
    // and establish valid connections
    server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(mock.HELLO);
      }
    });
    hostAddress = server.hostAddress();
  });

  beforeEach(() => {
    threadContext = new ThreadContext(hostAddress);
  });

  afterEach(async () => {
    await threadContext.tearDown();
  });

  const suites: CmapTest[] = loadSpecTests('connection-monitoring-and-pooling');

  for (const test of suites) {
    it(test.description, async function () {
      await runCmapTest(test, threadContext);
    });
  }
});
