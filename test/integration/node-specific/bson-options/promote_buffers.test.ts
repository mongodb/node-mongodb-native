import { expect } from 'chai';

import { setupDatabase } from '../../shared';

describe('Promote Buffers', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly honor promoteBuffers when creating an instance using Db', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1,
      promoteBuffers: true
    });

    const db = client.db(configuration.db);
    await db.collection('shouldCorrectlyHonorPromoteBuffer1').insertOne({
      doc: Buffer.alloc(256)
    });

    const doc = await db.collection('shouldCorrectlyHonorPromoteBuffer1').findOne();
    expect(doc.doc).to.be.instanceof(Buffer);
    await client.close();
  });

  it('should correctly honor promoteBuffers when creating an instance using MongoClient', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient({}, { promoteBuffers: true });
    const db = client.db(configuration.db);

    await db.collection('shouldCorrectlyHonorPromoteBuffer2').insertOne({
      doc: Buffer.alloc(256)
    });

    const doc = await db.collection('shouldCorrectlyHonorPromoteBuffer2').findOne();
    expect(doc.doc).to.be.instanceof(Buffer);
    await client.close();
  });

  it('should correctly honor promoteBuffers at cursor level', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient({}, { promoteBuffers: true });
    const db = client.db(configuration.db);

    await db.collection('shouldCorrectlyHonorPromoteBuffer3').insertOne({
      doc: Buffer.alloc(256)
    });

    const doc = await db.collection('shouldCorrectlyHonorPromoteBuffer3').find().next();
    expect(doc.doc).to.be.instanceof(Buffer);
    await client.close();
  });

  it('should correctly honor promoteBuffers at cursor find level', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient();
    const db = client.db(configuration.db);
    await db.collection('shouldCorrectlyHonorPromoteBuffer4').insertOne({
      doc: Buffer.alloc(256)
    });

    const doc = await db
      .collection('shouldCorrectlyHonorPromoteBuffer4')
      .find({}, { promoteBuffers: true })
      .next();
    expect(doc.doc).to.be.instanceof(Buffer);
    await client.close();
  });

  it('should correctly honor promoteBuffers at aggregate level', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient();
    const db = client.db(configuration.db);
    await db.collection('shouldCorrectlyHonorPromoteBuffer5').insertOne({
      doc: Buffer.alloc(256)
    });

    const doc = await db
      .collection('shouldCorrectlyHonorPromoteBuffer5')
      .aggregate([{ $match: {} }], { promoteBuffers: true })
      .next();
    expect(doc.doc).to.be.instanceof(Buffer);
    await client.close();
  });
});
