
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { AbstractCursor, ChangeStream, ClientSession, GridFSBucket, MongoClient } from 'mongodb/lib/beta';
import * as sinon from 'sinon';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { setTimeout } from 'timers/promises';

// @ts-expect-error Assigning readonly property.
Symbol.asyncDispose ??= Symbol('dispose');

async function setUpCollection(client: MongoClient) {
	const collection = client.db('foo').collection<{ name: string }>('bar');
	const documents: Array<{ name: string }> = Array.from({ length: 5 }).map(i => ({
		name: String(i)
	}));
	await collection.insertMany(documents)
	return collection;
}

describe('explicit resource management smoke tests', function () {
	const clientSpy = sinon.spy(MongoClient.prototype, Symbol.asyncDispose);
	const cursorSpy = sinon.spy(AbstractCursor.prototype, Symbol.asyncDispose);
	const endSessionSpy = sinon.spy(ClientSession.prototype, Symbol.asyncDispose);
	const changeStreamSpy = sinon.spy(ChangeStream.prototype, Symbol.asyncDispose);
	const readableSpy = sinon.spy(Readable.prototype, Symbol.asyncDispose);

	afterEach(function () {
		clientSpy.resetHistory();
		cursorSpy.resetHistory();
		endSessionSpy.resetHistory();
		changeStreamSpy.resetHistory();
		readableSpy.resetHistory();
	});

	describe('MongoClient', function () {
		it('can be used with await-using syntax', async function () {
			{
				await using client = new MongoClient(process.env.MONGODB_URI!);
				await client.connect();
			}
			expect(clientSpy.called).to.be.true;
			expect(clientSpy.callCount).to.equal(1);
		})
	})

	describe('Cursors', function () {
		it('can be used with await-using syntax', async function () {
			{
				await using client = new MongoClient(process.env.MONGODB_URI!);
				await client.connect();

				const collection = await setUpCollection(client);

				await using cursor = collection.find();
				await cursor.next();
				await cursor.next();
				await cursor.next();
			}
			expect(cursorSpy.callCount).to.equal(1);
		})

		describe('cursor streams', function() {
			it('can be used with await-using syntax', async function() {
				{
					await using client = new MongoClient(process.env.MONGODB_URI!);
					await client.connect();

					const collection = await setUpCollection(client);

					await using readable = collection.find().stream();
				}
				expect(readableSpy.callCount).to.equal(1);
			})
		})
	})

	describe('Sessions', function () {
		it('can be used with await-using syntax', async function () {
			{
				await using client = new MongoClient(process.env.MONGODB_URI!);
				await client.connect();

				await using session = client.startSession();
			}
			expect(endSessionSpy.callCount).to.equal(1);
		})
	})

	describe('ChangeStreams', function () {
		it('can be used with await-using syntax', async function () {
			{
				await using client = new MongoClient(process.env.MONGODB_URI!);
				await client.connect();

				const collection = await setUpCollection(client);
				await using cs = collection.watch();

				setTimeout(1000).then(() => collection.insertOne({ name: 'bailey' }));
				await cs.next();
			}
			expect(changeStreamSpy.callCount).to.equal(1);
		})
	});

	describe('GridFSDownloadStream', function () {
		it('can be used with await-using syntax', async function () {
			{
				await using client = new MongoClient(process.env.MONGODB_URI!);
				await client.connect();

				const bucket = new GridFSBucket(client.db('foo'));
				const uploadStream = bucket.openUploadStream('foo.txt')
				await pipeline(Readable.from("AAAAAAA".split('')), uploadStream);

				await using downloadStream = bucket.openDownloadStreamByName('foo.txt');

			}
			expect(readableSpy.callCount).to.equal(1);
		})
	});
})
