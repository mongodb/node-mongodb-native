import { MongoClient, ReduceFunction } from '../../../../src/index';

// https://docs.mongodb.com/manual/core/map-reduce/
// Declare emit function to be called inside map function
declare function emit(key: any, value: any): void;

interface TestMapReduceSchema {
  cust_id: string;
  amount: number;
  status: string;
}

function testCollectionMapFunction(this: TestMapReduceSchema) {
  emit(this.cust_id, this.amount);
}

function testCollectionReduceFunction(key: string, values: any[]): number {
  return values.length;
}

const client = new MongoClient('');
client
  .db('test')
  .collection<TestMapReduceSchema>('test-mapReduce-collection')
  .mapReduce(testCollectionMapFunction, testCollectionReduceFunction);
