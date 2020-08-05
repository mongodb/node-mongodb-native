import { CommandOperation } from './command';
import EvalOperation = require('./eval');
import { Code } from '../bson';
import { handleCallback } from '../utils';
import { defineAspects, Aspect } from './operation';

class GroupOperation extends CommandOperation {
  collectionName: string;
  keys: any;
  condition: any;
  initial: any;
  reduceFunction: Code;
  finalize: any;

  constructor(
    collection: any,
    keys: any,
    condition: any,
    initial: any,
    reduce: any,
    finalize: any,
    options: any
  ) {
    super(collection, options);
    this.collectionName = collection.collectionName;
    this.keys = keys;
    this.condition = condition;
    this.initial = initial;
    this.finalize = finalize;
    this.reduceFunction = reduce && reduce._bsontype === 'Code' ? reduce : new Code(reduce);
  }

  execute(server: any, callback: Function) {
    const selector = {
      group: {
        ns: this.collectionName,
        $reduce: this.reduceFunction,
        cond: this.condition,
        initial: this.initial,
        out: 'inline'
      }
    } as any;

    // if finalize is defined
    if (this.finalize != null) {
      selector.group.finalize = this.finalize;
    }

    // Set up group selector
    if ('function' === typeof this.keys || (this.keys && this.keys._bsontype === 'Code')) {
      selector.group.$keyf =
        this.keys && this.keys._bsontype === 'Code' ? this.keys : new Code(this.keys);
    } else {
      const hash: any = {};
      this.keys.forEach((key: any) => {
        hash[key] = 1;
      });

      selector.group.key = hash;
    }

    // Execute command
    super.executeCommand(server, selector, (err?: any, result?: any) => {
      if (err) return handleCallback(callback!, err, null);
      handleCallback(callback!, null, result.retval);
    });
  }
}

const groupFunction =
  'function () {\nvar c = db[ns].find(condition);\nvar map = new Map();\nvar reduce_function = reduce;\n\nwhile (c.hasNext()) {\nvar obj = c.next();\nvar key = {};\n\nfor (var i = 0, len = keys.length; i < len; ++i) {\nvar k = keys[i];\nkey[k] = obj[k];\n}\n\nvar aggObj = map.get(key);\n\nif (aggObj == null) {\nvar newObj = Object.extend({}, key);\naggObj = Object.extend(newObj, initial);\nmap.put(key, aggObj);\n}\n\nreduce_function(obj, aggObj);\n}\n\nreturn { "result": map.values() };\n}';

class EvalGroupOperation extends EvalOperation {
  constructor(
    collection: any,
    keys: any,
    condition: any,
    initial: any,
    reduce: any,
    finalize: any,
    options: any
  ) {
    // Create execution scope
    const scope = reduce != null && reduce._bsontype === 'Code' ? reduce.scope : {};

    scope.ns = collection.collectionName;
    scope.keys = keys;
    scope.condition = condition;
    scope.initial = initial;

    // Pass in the function text to execute within mongodb.
    const groupfn = groupFunction.replace(/ reduce;/, reduce.toString() + ';');

    super(collection, new Code(groupfn, scope), null, options);
  }

  execute(server: any, callback: Function) {
    super.execute(server, (err?: any, results?: any) => {
      if (err) return handleCallback(callback!, err, null);
      handleCallback(callback!, null, results.result || results);
    });
  }
}

defineAspects(GroupOperation, [Aspect.EXECUTE_WITH_SELECTION]);
export { GroupOperation, EvalGroupOperation };
