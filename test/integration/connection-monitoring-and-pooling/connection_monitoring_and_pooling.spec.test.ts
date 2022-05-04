import { HostAddress, MongoClient } from '../../../src';
import { loadSpecTests } from '../../spec';
import { CmapTest, runCmapTest, ThreadContext } from '../../tools/cmap_spec_runner';
import { isAnyRequirementSatisfied } from '../../tools/unified-spec-runner/unified-utils';

describe.only('Connection Monitoring and Pooling Spec Tests (Unit)', function () {
  let hostAddress: HostAddress, threadContext: ThreadContext;
  before(async () => {
    // hostAddress = server.hostAddress();
  });

  beforeEach(() => {
    // threadContext = new ThreadContext(hostAddress);
  });

  afterEach(async () => {
    // await threadContext.tearDown();
  });

  const suites: CmapTest[] = loadSpecTests('connection-monitoring-and-pooling');

  for (const test of suites.filter(test => test.style === 'integration')) {
    beforeEach(async function () {
      let utilClient: MongoClient;
      if (this.configuration.isLoadBalanced) {
        // The util client can always point at the single mongos LB frontend.
        utilClient = this.configuration.newClient(this.configuration.singleMongosLoadBalancerUri);
      } else {
        utilClient = this.configuration.newClient();
      }

      await utilClient.connect();

      const allRequirements = test.runOn;

      const someRequirementMet =
        !allRequirements.length ||
        (await isAnyRequirementSatisfied(this.currentTest.ctx, allRequirements, utilClient));

      await utilClient.close();

      if (!someRequirementMet) this.skip();
    });

    it(test.description, async function () {
      // await runCmapTest(test, threadContext);
    });
  }
});
