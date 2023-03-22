import { Long } from 'bson';

import { LEGACY_HELLO_COMMAND } from '../../constants';
import type { MonitorOptions } from '../../sdam/monitor';
import type { TopologyVersion } from '../../sdam/server_description';
import type { HandshakeDecorator } from './handshake_decorator';
import type { HandshakeDocument } from './handshake_document';

type MonitoringOptions = Readonly<
  Pick<MonitorOptions, 'connectTimeoutMS' | 'heartbeatFrequencyMS' | 'minHeartbeatFrequencyMS'>
>;

/**
 * Decorates the initial handshake with SDAM monitoring values.
 * @internal
 */
export class MonitorHandshakeDecorator implements HandshakeDecorator {
  monitorOptions: MonitoringOptions;
  topologyVersion: TopologyVersion | null;
  helloOk: boolean;

  /**
   * Instantiate the decorator with the relevant information.
   */
  constructor(
    monitorOptions: MonitoringOptions,
    topologyVersion: TopologyVersion | null,
    helloOk: boolean
  ) {
    this.monitorOptions = monitorOptions;
    this.topologyVersion = topologyVersion;
    this.helloOk = helloOk;
  }

  /**
   * Decorates the handshake. Monitoring connections have no auth context.
   */
  async decorate(handshake: HandshakeDocument): Promise<HandshakeDocument> {
    // If the initial server response has helloOk: true, the monitor can switch to hello.
    if (this.helloOk) {
      handshake.hello = 1;
    } else {
      handshake[LEGACY_HELLO_COMMAND] = 1;
    }
    // Check for streaming protocol and set options if supported.
    if (this.topologyVersion) {
      const maxAwaitTimeMS = this.monitorOptions.heartbeatFrequencyMS;
      handshake.maxAwaitTimeMS = maxAwaitTimeMS;
      handshake.topologyVersion = makeTopologyVersion(this.topologyVersion);
    }
    // Always send helloOk in the handshake.
    handshake.helloOk = true;
    return handshake;
  }
}

function makeTopologyVersion(tv: TopologyVersion) {
  return {
    processId: tv.processId,
    // tests mock counter as just number, but in a real situation counter should always be a Long
    // TODO(NODE-2674): Preserve int64 sent from MongoDB
    counter: Long.isLong(tv.counter) ? tv.counter : Long.fromNumber(tv.counter)
  };
}
