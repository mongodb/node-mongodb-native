import { CommandOperation, CommandOperationOptions } from './command';
import { EvalOperation } from './eval';
import { Code, Document } from '../bson';
import type { Callback } from '../utils';
import type { Server } from '../sdam/server';
import type { Collection } from '../collection';

export type GroupOptions = CommandOperationOptions;

/** @internal */
export class GroupOperation extends CommandOperation<GroupOptions, Document> {
  collectionName: string;
  keys: any;
  condition: any;
  initial: any;
  reduceFunction: Code;
  finalize: any;

  constructor(
    collection: Collection,
    keys: any,
    condition: any,
    initial: any,
    reduce: any,
    finalize: any,
    options: GroupOptions
  ) {
    super(collection, options);
    this.collectionName = collection.collectionName;
    this.keys = keys;
    this.condition = condition;
    this.initial = initial;
    this.finalize = finalize;
    this.reduceFunction = reduce && reduce._bsontype === 'Code' ? reduce : new Code(reduce);
  }

  execute(server: Server, callback: Callback<Document>) {
    const cmd: Document = {
      group: {
        ns: this.collectionName,
        $reduce: this.reduceFunction,
        cond: this.condition,
        initial: this.initial,
        out: 'inline'
      }
    };

    // if finalize is defined
    if (this.finalize != null) {
      cmd.group.finalize = this.finalize;
    }

    // Set up group selector
    if ('function' === typeof this.keys || (this.keys && this.keys._bsontype === 'Code')) {
      cmd.group.$keyf =
        this.keys && this.keys._bsontype === 'Code' ? this.keys : new Code(this.keys);
    } else {
      const hash: any = {};
      this.keys.forEach((key: any) => {
        hash[key] = 1;
      });

      cmd.group.key = hash;
    }

    // Execute command
    super.executeCommand(server, cmd, (err, result) => {
      if (err) return callback(err);
      callback(undefined, result.retval);
    });
  }
}

const groupFunction =
  'function () {\nvar c = db[ns].find(condition);\nvar map = new Map();\nvar reduce_function = reduce;\n\nwhile (c.hasNext()) {\nvar obj = c.next();\nvar key = {};\n\nfor (var i = 0, len = keys.length; i < len; ++i) {\nvar k = keys[i];\nkey[k] = obj[k];\n}\n\nvar aggObj = map.get(key);\n\nif (aggObj == null) {\nvar newObj = Object.extend({}, key);\naggObj = Object.extend(newObj, initial);\nmap.put(key, aggObj);\n}\n\nreduce_function(obj, aggObj);\n}\n\nreturn { "result": map.values() };\n}';

export class EvalGroupOperation extends EvalOperation {
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

    super(collection, new Code(groupfn, scope), undefined, options);
  }
}
