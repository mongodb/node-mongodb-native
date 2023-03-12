#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail
set -o xtrace   # Write all commands first to stderr

# Explanation of environment variables:
#
# TEST_LAMBDA_DIRECTORY: The root of the project's Lambda sam project.
# DRIVERS_ATLAS_PUBLIC_API_KEY: The public Atlas key for the drivers org.
# DRIVERS_ATLAS_PRIVATE_API_KEY: The private Atlas key for the drivers org.
# DRIVERS_ATLAS_LAMBDA_USER: The user for the lambda cluster.
# DRIVERS_ATLAS_LAMBDA_PASSWORD: The password for the user.
# DRIVERS_ATLAS_GROUP_ID: The id of the individual projects under the drivers org, per language.
# LAMBDA_STACK_NAME: The name of the stack on lambda "dbx-<language>-lambda"
# MONGODB_URI: The URI for the created Atlas cluster during this script.

# The base Atlas API url. We use the API directly as the CLI does not yet
# support testing cluster outages.
ATLAS_BASE_URL="https://cloud.mongodb.com/api/atlas/v1.0"

# Switch to the directory the Lambda tests reside in.
# cd "${TEST_LAMBDA_DIRECTORY}"

# Set the create cluster configuration.
CREATE_CLUSTER_JSON=$(cat <<EOF
{
  "autoScaling" : {
    "autoIndexingEnabled" : false,
    "compute" : {
      "enabled" : true,
      "scaleDownEnabled" : true
    },
    "diskGBEnabled" : true
  },
  "backupEnabled" : false,
  "biConnector" : {
    "enabled" : false,
    "readPreference" : "secondary"
  },
  "clusterType" : "REPLICASET",
  "diskSizeGB" : 10.0,
  "encryptionAtRestProvider" : "NONE",
  "mongoDBMajorVersion" : "6.0",
  "mongoDBVersion" : "6.0.4",
  "name" : "${LAMBDA_STACK_NAME}",
  "numShards" : 1,
  "paused" : false,
  "pitEnabled" : false,
  "providerBackupEnabled" : false,
  "providerSettings" : {
    "providerName" : "AWS",
    "autoScaling" : {
      "compute" : {
        "maxInstanceSize" : "M20",
        "minInstanceSize" : "M10"
      }
    },
    "diskIOPS" : 3000,
    "encryptEBSVolume" : true,
    "instanceSizeName" : "M10",
    "regionName" : "US_EAST_1",
    "volumeType" : "STANDARD"
  },
  "replicationFactor" : 3,
  "rootCertType" : "ISRGROOTX1",
  "terminationProtectionEnabled" : false,
  "versionReleaseSystem" : "LTS"
}
EOF
)

# Create an Atlas M10 cluster - this returns immediately so we'll need to poll until
# the cluster is created.
create_cluster ()
{
  echo "Creating new Atlas Cluster..."
  echo $(curl \
    --digest -u "${DRIVERS_ATLAS_PUBLIC_API_KEY}:${DRIVERS_ATLAS_PRIVATE_API_KEY}" \
    -d "${CREATE_CLUSTER_JSON}" \
    -H 'Content-Type: application/json' \
    -X POST \
    "${ATLAS_BASE_URL}/groups/${DRIVERS_ATLAS_GROUP_ID}/clusters?pretty=true"
  )
}

# Delete the cluster.
delete_cluster ()
{
  echo $(curl \
    --digest -u ${DRIVERS_ATLAS_PUBLIC_API_KEY}:${DRIVERS_ATLAS_PRIVATE_API_KEY} \
    -X DELETE \
    "${ATLAS_BASE_URL}/groups/${DRIVERS_ATLAS_GROUP_ID}/clusters/${LAMBDA_STACK_NAME}?pretty=true"
  )
}

# Check is cluster has a srv address, and assume once it does, it can be used.
check_cluster ()
{
  count=0
  SRV_ADDRESS="null"
  # Don't try longer than 15 minutes.
  while [ $SRV_ADDRESS = "null" ] && [ $count -le 30 ]; do
    echo "Checking every 30 seconds for cluster to be created..."
    # Poll every 30 seconds to check the cluster creation.
    sleep 30
    SRV_ADDRESS=$(curl \
      --digest -u "${DRIVERS_ATLAS_PUBLIC_API_KEY}:${DRIVERS_ATLAS_PRIVATE_API_KEY}" \
      -X GET \
      "${ATLAS_BASE_URL}/groups/${DRIVERS_ATLAS_GROUP_ID}/clusters/${LAMBDA_STACK_NAME}" \
      | jq -r '.srvAddress'
    );
    count=$(( $count + 1 ))
    echo $SRV_ADDRESS
  done

  if [ $SRV_ADDRESS = "null" ]; then
    echo "No cluster could be created in the 15 minute timeframe or error occured. Deleting potential cluster."
    delete_cluster
    exit 1
  else
    echo "Setting MONGODB_URI in the environment to the new cluster"
    # else set the mongodb uri
    URI=$(echo $SRV_ADDRESS | grep -Eo "[^(\/\/)]*$" | cat)
    MONGODB_URI="mongodb+srv://${DRIVERS_ATLAS_LAMBDA_USER}:${DRIVERS_ATLAS_LAMBDA_PASSWORD}@${URI}"
    export MONGODB_URI=$MONGODB_URI
  fi
}

# Restarts the cluster's primary node.
restart_cluster_primary ()
{
  echo "Testing Atlas primary restart..."
  echo $(curl \
    --digest -u ${DRIVERS_ATLAS_PUBLIC_API_KEY}:${DRIVERS_ATLAS_PRIVATE_API_KEY} \
    -X POST \
    "${ATLAS_BASE_URL}/groups/${DRIVERS_ATLAS_GROUP_ID}/clusters/${LAMBDA_STACK_NAME}/restartPrimaries"
  )
}

# Deploys a lambda function to the set stack name.
deploy_lambda_function ()
{
  echo "Deploying Lambda function..."
  sam deploy \
    --stack-name "${LAMBDA_STACK_NAME}" \
    --capabilities CAPABILITY_IAM \
    --resolve-s3 \
    --parameter-overrides "MongoDbUri=${MONGODB_URI}"
}

# Get the ARN for the Lambda function we created and export it.
get_lambda_function_arn ()
{
  echo "Getting Lambda function ARN..."
  LAMBDA_FUNCTION_ARN=$(sam list stack-outputs \
    --stack-name ${LAMBDA_STACK_NAME} \
    --output json | jq '.[] | select(.OutputKey == "MongoDBFunction") | .OutputValue'
  )
  echo "Lambda function ARN: $LAMBDA_FUNCTION_ARN"
  export LAMBDA_FUNCTION_ARN=$LAMBDA_FUNCTION_ARN
}

# Create a new Atlas cluster for the function to use.
create_cluster

# Check if the cluster has been created.
check_cluster

# Build the function.
sam build

# Deploy the function - need to pull out the ARN for the function to invoke.
deploy_lambda_function

# Figure out the Lambda function ARN to invoke it.
get_lambda_function_arn

# Invoke the function
aws lambda invoke --function-name "${LAMBDA_FUNCTION_ARN}" "lambda-invoke-standard.json"

# Sleep 1 min to get some heartbeat buildup, then invoke.
echo "Sleeping 1 minute to build up some streaming protocol heartbeats..."
sleep 60
aws lambda invoke --function-name "${LAMBDA_FUNCTION_ARN}" "lambda-invoke-frozen.json"

# Test Atlas primary re-election.
restart_cluster_primary

# Invoke the function after 1 minute.
echo "Sleeping 1 minute to build up some streaming protocol heartbeats..."
sleep 60
aws lambda invoke --function-name "${LAMBDA_FUNCTION_ARN}" "lambda-invoke-outage.json"

# Delete the function.
sam delete --stack-name ${LAMBDA_STACK_NAME} --no-prompts

# Delete the Atlas cluster.
delete_cluster
