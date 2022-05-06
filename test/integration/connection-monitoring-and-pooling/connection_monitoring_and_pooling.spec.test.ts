import { HostAddress, MongoClient } from '../../../src';
import { shuffle } from '../../../src/utils';
import { loadSpecTests } from '../../spec';
import { CmapTest, runCmapTest, ThreadContext } from '../../tools/cmap_spec_runner';
import { isAnyRequirementSatisfied } from '../../tools/unified-spec-runner/unified-utils';

describe.only('Connection Monitoring and Pooling Spec Tests (Integration)', function () {
  const suites: CmapTest[] = loadSpecTests('connection-monitoring-and-pooling');

  for (const test of suites /*.filter(test => test.style === 'integration')*/) {
    let hostAddress: HostAddress, threadContext: ThreadContext, client: MongoClient;

    beforeEach(async function () {
      let utilClient: MongoClient;
      if (this.configuration.isLoadBalanced) {
        // The util client can always point at the single mongos LB frontend.
        console.log('TEST DEBUG: Load balanced', this.configuration.singleMongosLoadBalancerUri);
        utilClient = this.configuration.newClient(this.configuration.singleMongosLoadBalancerUri);
      } else {
        console.log('TEST DEBUG: Not load balanced');
        utilClient = this.configuration.newClient();
      }

      await utilClient.connect();

      const allRequirements = test.runOn || [];

      const someRequirementMet =
        !allRequirements.length ||
        (await isAnyRequirementSatisfied(this.currentTest.ctx, allRequirements, utilClient));

      if (!someRequirementMet) {
        await utilClient.close();
        this.skip();
        // NOTE: the rest of the code below won't execute after the skip is invoked
      }

      try {
        const serverMap = utilClient.topology.s.description.servers;
        const hosts = shuffle(serverMap.keys());
        const selectedHostUri = hosts[0];
        hostAddress = serverMap.get(selectedHostUri).hostAddress;
        threadContext = new ThreadContext(
          hostAddress,
          this.configuration.isLoadBalanced ? { loadBalanced: true } : {}
        );

        if (test.failPoint) {
          client = this.configuration.newClient(
            `mongodb://${hostAddress}/${
              this.configuration.isLoadBalanced ? '?loadBalanced=true' : '?directConnection=true'
            }`
          );
          console.log('TEST DEBUG: failpoint', hostAddress);
          await client.connect();
          await client.db('admin').command(test.failPoint);
        }
      } finally {
        await utilClient.close();
      }
    });

    afterEach(async function () {
      await threadContext?.tearDown();
      if (!client) {
        return;
      }
      if (test.failPoint) {
        await client
          .db('admin')
          .command({ configureFailPoint: test.failPoint.configureFailPoint, mode: 'off' });
      }
      await client.close();
    });

    it(test.description, async function () {
      await runCmapTest(test, threadContext);
    });
  }
});
