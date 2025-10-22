// eslint-disable-next-line @typescript-eslint/no-require-imports
const events = require('events');

const EventEmitter = events.EventEmitter;

// TODO(NODE-7253): revisit this testing approach
events.EventEmitter = class RequireErrorListenerEventEmitter extends EventEmitter {
  constructor(...args) {
    super(...args);
    const ctorCallSite = new Error('EventEmitter must add an error listener synchronously');
    ctorCallSite.stack;
    process.nextTick(() => {
      const isChangeStream = this.constructor.name
        .toLowerCase()
        .includes('ChangeStream'.toLowerCase());

      if (isChangeStream) {
        // TODO(NODE-6699): Include checking change streams when the API requirements for error listeners has been clarified
        // Comment out the return to check for ChangeStreams in the tests that may be missing error listeners
        return;
      }

      // gcp-metadata uses logging-utils whose AdhocDebugLogger extends EE
      // https://github.com/googleapis/gax-nodejs/blob/acfbe801d92219693b7ea5487ef701a77657dec8/logging-utils/src/logging-utils.ts#L163
      if (this.constructor.name === 'AdhocDebugLogger') {
        return;
      }

      if (this.listenerCount('error') === 0) {
        throw ctorCallSite;
      }
    });
  }
};
