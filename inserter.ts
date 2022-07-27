import { MongoClient } from './src';
import { promisify } from 'util';

async function main() {
    const client = new MongoClient("")

    while (true) {
        const { insertedId } = await client.db('test').collection('test-collection').insertOne({ name: 'bumpy' })
        console.log(insertedId);
        await promisify(setTimeout)(2000);
        await client.db('test').collection('test-collection').deleteOne({ _id: insertedId })
        console.log('deleted');
        await promisify(setTimeout)(2000);
    }
}

main()
