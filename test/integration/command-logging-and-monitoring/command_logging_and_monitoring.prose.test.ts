import { expect } from 'chai';

import { DEFAULT_MAX_DOCUMENT_LENGTH, type Document } from '../../mongodb';

describe('Command Logging and Monitoring Prose Tests', function () {
  const ELLIPSES_LENGTH = 3;
  let client;
  let writable;

  context('When no custom truncation limit is provided', function () {
    /*
        1. Configure logging with a minimum severity level of "debug" for the "command" component.
           Do not explicitly configure the max document length.

        2. Construct an array docs containing the document {"x" : "y"} repeated 100 times.

        3. Insert docs to a collection via insertMany.

        4. Inspect the resulting "command started" log message and assert that
            the "command" value is a string of length 1000 + (length of trailing ellipsis).

        5. Inspect the resulting "command succeeded" log message and assert that
           the "reply" value is a string of length <= 1000 + (length of trailing ellipsis).

        6. Run find() on the collection where the document was inserted.

        7. Inspect the resulting "command succeeded" log message and assert that
           the reply is a string of length 1000 + (length of trailing ellipsis).
    */

    beforeEach(async function () {
      writable = {
        buffer: [],
        write(log) {
          this.buffer.push(log);
        }
      };
      // 1.
      client = this.configuration.newClient(
        {},
        {
          __enableMongoLogger: true,
          mongodbLogPath: writable,
          mongodbLogComponentSeverities: {
            command: 'debug'
          }
        }
      );
    });

    afterEach(async function () {
      await client.close();
    });

    it('should follow default truncation limit of 1000', async function () {
      // 2.
      const docs: Array<Document> = [];
      for (let i = 0; i < 100; i++) {
        docs.push({ x: 'y' });
      }

      // 3.
      await client.db('admin').collection('test').insertMany(docs);

      // 4.
      const insertManyCommandStarted = writable.buffer[0];
      expect(insertManyCommandStarted?.message).to.equal('Command started');
      expect(insertManyCommandStarted?.command).to.be.a('string');
      expect(insertManyCommandStarted?.command?.length).to.equal(
        DEFAULT_MAX_DOCUMENT_LENGTH + ELLIPSES_LENGTH
      );

      // 5.
      const insertManyCommandSucceeded = writable.buffer[1];
      expect(insertManyCommandSucceeded?.message).to.equal('Command succeeded');
      expect(insertManyCommandSucceeded?.reply).to.be.a('string');
      expect(insertManyCommandSucceeded?.reply?.length).to.be.at.most(
        DEFAULT_MAX_DOCUMENT_LENGTH + ELLIPSES_LENGTH
      );

      // 6.
      await client.db('admin').collection('test').find().toArray();

      // 7.
      const findCommandSucceeded = writable.buffer[3];
      expect(findCommandSucceeded?.message).to.equal('Command succeeded');
      expect(findCommandSucceeded?.reply).to.be.a('string');
      expect(findCommandSucceeded?.reply?.length).to.equal(
        DEFAULT_MAX_DOCUMENT_LENGTH + ELLIPSES_LENGTH
      );
    });
  });

  context('When custom truncation limit is provided', function () {
    /*
    1. Configure logging with a minimum severity level of "debug" for the "command" component.
        Set the max document length to 5.

    2. Run the command {"hello": true}.

    3. Inspect the resulting "command started" log message and assert that
        the "command" value is a string of length 5 + (length of trailing ellipsis).

    4. Inspect the resulting "command succeeded" log message and assert that
        the "reply" value is a string of length 5 + (length of trailing ellipsis).

    5. (Optional)
        If the driver attaches raw server responses to failures
        and can access these via log messages to assert on,
        run the command {"notARealCommand": true}.

        Inspect the resulting "command failed" log message
        and confirm that the server error is a string of length 5 + (length of trailing ellipsis).
    */
    beforeEach(async function () {
      writable = {
        buffer: [],
        write(log) {
          this.buffer.push(log);
        }
      };
      // 1.
      client = this.configuration.newClient(
        {},
        {
          __enableMongoLogger: true,
          mongodbLogPath: writable,
          mongodbLogComponentSeverities: {
            command: 'debug'
          },
          mongodbLogMaxDocumentLength: 5
        }
      );
    });

    afterEach(async function () {
      await client.close();
    });

    it('should follow custom truncation limit', async function () {
      // 2.
      await client.db('admin').command({ hello: 'true' });

      // 3.
      const insertManyCommandStarted = writable.buffer[0];
      expect(insertManyCommandStarted?.message).to.equal('Command started');
      expect(insertManyCommandStarted?.command).to.be.a('string');
      expect(insertManyCommandStarted?.command?.length).to.equal(5 + ELLIPSES_LENGTH);

      // 4.
      const insertManyCommandSucceeded = writable.buffer[1];
      expect(insertManyCommandSucceeded?.message).to.equal('Command succeeded');
      expect(insertManyCommandSucceeded?.reply).to.be.a('string');
      expect(insertManyCommandSucceeded?.reply?.length).to.be.at.most(5 + ELLIPSES_LENGTH);
    });
  });

  context('Truncation with multi-byte codepoints', function () {
    /*
    A specific test case is not provided here due to the allowed variations in truncation logic
     as well as varying extended JSON whitespace usage.
     Drivers MUST write language-specific tests that confirm truncation of commands, replies,
     and (if applicable) server responses included in error messages
     work as expected when the data being truncated includes multi-byte Unicode codepoints.

     If the driver uses anything other than Unicode codepoints as the unit for max document length,
     there also MUST be tests confirming that cases
     where the max length falls in the middle of a multi-byte codepoint are handled gracefully.
    */

    const maxDocLength = 39;
    beforeEach(async function () {
      writable = {
        buffer: [],
        write(log) {
          this.buffer.push(log);
        }
      };
      // 1.
      client = this.configuration.newClient(
        {},
        {
          __enableMongoLogger: true,
          mongodbLogPath: writable,
          mongodbLogComponentSeverities: {
            command: 'debug'
          },
          mongodbLogMaxDocumentLength: maxDocLength
        }
      );
    });

    afterEach(async function () {
      await client.close();
    });

    it('should handle unicode codepoints in middle and end of truncation gracefully', async function () {
      const multibyteUnicode = '\uD801\uDC37';
      const firstByteChar = multibyteUnicode.charCodeAt(0);
      const secondByteChar = multibyteUnicode.charCodeAt(1);
      const docs: Array<Document> = [
        {
          x: `${multibyteUnicode}${multibyteUnicode}${multibyteUnicode}${multibyteUnicode}`
        }
      ];

      await client.db('admin').collection('test').insertMany(docs);

      const insertManyCommandStarted = writable.buffer[0];
      expect(insertManyCommandStarted?.message).to.equal('Command started');
      expect(insertManyCommandStarted?.command).to.be.a('string');
      // maxDocLength - 1 because stringified response should be rounded down due to ending mid-codepoint
      expect(insertManyCommandStarted?.command?.length).to.equal(
        maxDocLength - 1 + ELLIPSES_LENGTH
      );

      // multi-byte codepoint in middle of truncated string
      expect(insertManyCommandStarted?.command.charCodeAt(maxDocLength - 2)).to.equal(
        secondByteChar
      );
      expect(insertManyCommandStarted?.command.charCodeAt(maxDocLength - 3)).to.equal(
        firstByteChar
      );

      const insertManyCommandSucceeded = writable.buffer[1];
      expect(insertManyCommandSucceeded?.message).to.equal('Command succeeded');
      expect(insertManyCommandSucceeded?.reply).to.be.a('string');
      expect(insertManyCommandSucceeded?.reply?.length).to.be.at.most(
        maxDocLength + ELLIPSES_LENGTH
      );
    });
  });
});
