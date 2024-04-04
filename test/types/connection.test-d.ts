import { expectError, expectType } from 'tsd';

import { type Connection, type Document, MongoDBResponse, ns } from '../mongodb';

declare const connection: Connection;

expectType<Document>(await connection.command(ns('a'), { cmd: 1 }));
expectType<Document>(await connection.command(ns('a'), { cmd: 1 }, undefined));
expectType<Document>(await connection.command(ns('a'), { cmd: 1 }, { socketTimeoutMS: 1 }));

class A extends MongoDBResponse {
  myProperty = 0n;
}

expectType<A>(await connection.command(ns('a'), { cmd: 1 }, undefined, A));
expectType<A>(await connection.command(ns('a'), { cmd: 1 }, { socketTimeoutMS: 1 }, A));
expectType<bigint>(
  (await connection.command(ns('a'), { cmd: 1 }, { socketTimeoutMS: 1 }, A)).myProperty
);

expectError(await connection.command(ns('a'), { cmd: 1 }, { socketTimeoutMS: 1 }, Boolean));
