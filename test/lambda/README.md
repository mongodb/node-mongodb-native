Prerequisites:
- AWS SAM CLI
- Docker daemon running

Environment:
- `MONGODB_URI`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Function Setup:

1. `sam init` and follow instructions for your language, creating a hello world example.

2. Modify the generated function and template.yaml, renaming as needed, and add the
   following functionality:
   - Must create and cache a `MongoClient` during the init phase of the function.
     - For dynamic languages this is at module load time.
     - For static languages this can be done in the function constructor.
     - The MongoClient must get the uri from the `MONGODB_URI` environment variable.
   - The following events must be listened to on the client, and should be added and removed
     within the handler function itself.
     - command started
     - command succeeded
     - command failed
     - server heartbeat started
     - server heartbeat succeeded
     - server heartbeat failed
     - connection created
     - connection closed
  - The function itself must insert one document and delete that document
  - The function must return JSON with the average duration times of each suceeded
    event, the number of connections created and closed, and heartbeat count:
    ```json
      {
        "averageCommandSuceeded": 40,
        "averageHeartbeatSuceeded": 20,
        "openConnections": 1,
        "heartbeatCount": 10
      }
    ```
  - Update template.yaml to provide a default MONGODB_URI in the Globals section:
    ```yaml
      Globals:
        Function:
          Timeout: 10
          Environment:
            Variables:
              MONGODB_URI: 'mongodb://127.0.0.1:27017'
    ```

3. Create env.json with the format:
    ```json
      {
        "Parameters": {
          "MONGODB_URI": "<uri to test>"
        }
      }
    ```

4. `sam build` from the project directory to build the function.

5. `sam local invoke --env-vars ./env.json` to create the container and run the function locally.

Function Testing:

1. `sam build`

2. `sam sync --stack-name drivers-testing --watch`
