import { type Document } from 'bson';

export * from './index';

/**
 * @internal
 *
 * Since we don't bundle tslib helpers, we need to polyfill this method.
 *
 * This is used in the generated JS.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function __exportStar(mod: Document) {
  for (const key of Object.keys(mod)) {
    exports[key] = void 0;
    Object.defineProperty(exports, key, {
      enumerable: true,
      get: function () {
        return mod[key];
      }
    });
  }
}
