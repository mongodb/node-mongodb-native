import { type Document } from 'bson';

export * from './index';

/**
 * @internal
 *
 * Since we don't bundle tslib helpers, we need to polyfill this method.
 *
 * This is used in the generated JS.  Adapted from https://github.com/microsoft/TypeScript/blob/aafdfe5b3f76f5c41abeec412ce73c86da94c75f/src/compiler/factory/emitHelpers.ts#L1202.
 */

function __exportStar(mod: Document) {
  for (const key of Object.keys(mod)) {
    Object.defineProperty(exports, key, {
      enumerable: true,
      get: function () {
        return mod[key];
      }
    });
  }
}
