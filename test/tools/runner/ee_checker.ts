// eslint-disable-next-line @typescript-eslint/no-require-imports
const events = require('events');

const EventEmitter = events.EventEmitter;

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

      if (this.listenerCount('error') === 0) {
        throw ctorCallSite;
      }
    });
  }
};
