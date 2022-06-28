import { expect } from 'chai';

describe('Collection', () => {
  describe('#estimated_document_count', () => {
    context('when providing a comment', () => {
      context('when the comment is null', () => {
        let client;
        let commandStartedEvent;

        beforeEach(async function () {
          client = this.configuration.newClient({ monitorCommands: true });
          client.on('commandStarted', event => {
            if (event.commandName === 'count') {
              commandStartedEvent = event;
            }
          });
          await client.connect();
        });

        afterEach(async () => {
          await client?.close();
        });

        it('adds the comment to the command', async () => {
          await client.db('test').collection('test').estimatedDocumentCount({ comment: null });
          expect(commandStartedEvent.command.comment).to.equal(null);
        });
      });
    });
  });
});
