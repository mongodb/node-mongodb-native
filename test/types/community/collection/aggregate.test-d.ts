import { expectNotType, expectType } from 'tsd';

import { type AggregationCursor, type Document, MongoClient } from '../../../../src';

// collection.aggregate tests
const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

interface Payment {
  total: number;
}
const cursor: AggregationCursor<Payment> = collection.aggregate<Payment>([{}]);

const payments = db.collection<Payment>('banking');
expectType<AggregationCursor<Document>>(payments.aggregate());
expectNotType<AggregationCursor<Payment>>(payments.aggregate());

cursor.match({ bar: 1 }).limit(10);

collection.aggregate([{ $match: { bar: 1 } }, { $limit: 10 }]);
collection.aggregate([{ $match: { bar: 1 } }]).limit(10);
collection.aggregate([]).match({ bar: 1 }).limit(10);
collection.aggregate().match({ bar: 1 }).limit(10);
collection.aggregate().unwind('total');
collection.aggregate().unwind({ path: 'total' });

collection.aggregate<Payment>([{ $match: { bar: 1 } }]).limit(10);

collection.aggregate<Payment>([]).match({ bar: 1 }).limit(10);

collection.aggregate<Payment>().match({ bar: 1 }).limit(10);

interface Employee {
  firstName: string;
  lastName: string;
  department: string;
}

interface EmployeeName {
  fullName: string;
}

expectType<AggregationCursor<EmployeeName>>(
  collection.aggregate<Employee>().project<EmployeeName>({
    fullName: { $concat: ['$firstName', ' ', '$lastName'] }
  })
);

interface DepartmentSummary {
  _id: string;
  count: number;
}

expectType<AggregationCursor<DepartmentSummary>>(
  collection.aggregate<Employee>().group<DepartmentSummary>({
    _id: '$department',
    count: { $sum: 1 }
  })
);
