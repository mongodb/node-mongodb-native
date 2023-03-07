#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

# Explanation of environment variables:
#
# PROJECT_DIRECTORY: The root of the project.
# DRIVERS_ATLAS_PUBLIC_API_KEY: The public Atlas key for the drivers org.
# DRIVERS_ATLAS_PRIVATE_API_KEY: The private Atlas key for the drivers org.
# DRIVERS_ATLAS_GROUP_ID: The id of the individual projects under the drivers org, per language.
# LAMBDA_STACK_NAME: The name of the stack on lambda "dbx-<language>-lambda"
# MONGODB_URI: The URI for the created Atlas cluster during this script.

cd "${PROJECT_DIRECTORY}/test/lambda"

# Set the create cluster configuration.
CREATE_CLUSTER_JSON=$(cat <<EOF
  {
    "autoScaling": {
      "compute": {
        "enabled": false,
        "scaleDownEnabled": false
      },
      "diskGBEnabled": false
    },
    "backupEnabled": false,
    "biConnector": {
      "enabled": false,
      "readPreference": "PRIMARY"
    },
    "clusterType": "REPLICASET",
    "diskSizeGB": 10,
    "encryptionAtRestProvider": "NONE",
    "labels": [],
    "mongoDBMajorVersion": "6.0",
    "name": "${LAMBDA_STACK_NAME}",
    "numShards": 1,
    "paused": false,
    "pitEnabled": false,
    "providerBackupEnabled": false,
    "providerSettings": {
      "providerName": "AWS",
      "instanceSizeName": "M10",
      "regionName": "US_EAST_1",
      "volumeType": "STANDARD"
    },
    "rootCertType": "ISRGROOTX1",
    "terminationProtectionEnabled": false,
    "versionReleaseSystem": "LTS"
  }
EOF
)

# Create an Atlas M10 cluster.
curl \
  --digest -u ${DRIVERS_ATLAS_PUBLIC_API_KEY}:${DRIVERS_ATLAS_PRIVATE_API_KEY}
  -d "${CREATE_CLUSTER_JSON}" \
  -H 'Content-Type: application/json' \
  -x POST \
  https://cloud.mongodb.com/api/atlas/v1.0/groups/${DRIVERS_ATLAS_GROUP_ID}/clusters

# Set response body's connectionStrings.standardSrv to MONGODB_URI

# Build the function.
sam build

# Deploy the function.
sam deploy \
  --stack-name ${LAMBDA_STACK_NAME} \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --parameter-overrides "MongoDbUri=${MONGODB_URI}"

# Invoke the function
aws lambda invoke --function-name <function arn> lambda-invoke-standard.json

# Sleep 1 min to get some heartbeat buildup, then invoke.
aws lambda invoke --function-name <function arn> lambda-invoke-frozen.json

# Test Atlas outage.
curl \
  --digest -u ${DRIVERS_ATLAS_PUBLIC_API_KEY}:${DRIVERS_ATLAS_PRIVATE_API_KEY}
  -x POST \
  https://cloud.mongodb.com/api/atlas/v1.0/groups/${DRIVERS_ATLAS_GROUP_ID}/clusters/${LAMBDA_STACK_NAME}/restartPrimaries

# Invoke the function.
aws lambda invoke --function-name <function arn> lambda-invoke-outage.json

# Delete the function.
sam delete --stack-name ${LAMBDA_STACK_NAME} --no-prompts

# Delete the cluster.
curl \
  --digest -u ${DRIVERS_ATLAS_PUBLIC_API_KEY}:${DRIVERS_ATLAS_PRIVATE_API_KEY}
  -x DELETE \
  https://cloud.mongodb.com/api/atlas/v1.0/groups/${DRIVERS_ATLAS_GROUP_ID}/clusters/{LAMBDA_STACK_NAME}
