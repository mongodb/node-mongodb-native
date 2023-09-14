#!/bin/bash
set -o errexit  # Exit the script with error if any of the commands fail

# Explanation of required environment variables:
#
# TEST_LAMBDA_DIRECTORY: The root of the project's Lambda sam project.
# LAMBDA_STACK_NAME: The name of the stack on lambda "dbx-<language>-lambda"
# AWS_REGION: The region for the function - generally us-east-1

VARLIST=(
TEST_LAMBDA_DIRECTORY
LAMBDA_STACK_NAME
AWS_REGION
)

# Ensure that all variables required to run the test are set, otherwise throw
# an error.
for VARNAME in ${VARLIST[*]}; do
[[ -z "${!VARNAME}" ]] && echo "ERROR: $VARNAME not set" && exit 1;
done

FUNCTION_NAME="${LAMBDA_STACK_NAME}-${TASK_NAME}-$(git rev-parse --short HEAD)"

# Deploys a lambda function to the set stack name.
deploy_lambda_function ()
{
  echo "Deploying Lambda function..."
  sam deploy \
    --stack-name "${FUNCTION_NAME}" \
    --capabilities CAPABILITY_IAM \
    --resolve-s3 \
    --parameter-overrides "MongoDbOidcUri=${AWS_LAMBDA_OIDC_MONGODB_URI} AwsWebIdentityTokenFile=${AWS_WEB_IDENTITY_TOKEN_FILE} LambdaMetricsUri=${LAMBDA_METRICS_URI}" \
    --region ${AWS_REGION}
}

# Get the ARN for the Lambda function we created and export it.
get_lambda_function_arn ()
{
  echo "Getting Lambda function ARN..."
  LAMBDA_FUNCTION_ARN=$(sam list stack-outputs \
    --stack-name ${FUNCTION_NAME} \
    --region ${AWS_REGION} \
    --output json | jq '.[] | select(.OutputKey == "MongoDBFunction") | .OutputValue' | tr -d '"'
  )
  echo "Lambda function ARN: $LAMBDA_FUNCTION_ARN"
  export LAMBDA_FUNCTION_ARN=$LAMBDA_FUNCTION_ARN
}

delete_lambda_function ()
{
  echo "Deleting Lambda Function..."
  sam delete --stack-name ${FUNCTION_NAME} --no-prompts --region us-east-1
}

cleanup ()
{
  delete_lambda_function
}

trap cleanup EXIT SIGHUP

cd "${TEST_LAMBDA_DIRECTORY}"

# Copy the token file to the lambda directory to get deployed.
cp /tmp/tokens/test_user1 mongodb/test_user1

sam build

deploy_lambda_function

get_lambda_function_arn

check_lambda_output () {
  if grep -q FunctionError output.json
  then
      echo "Exiting due to FunctionError!"
      exit 1
  fi
  cat output.json | jq -r '.LogResult' | base64 --decode
}

for i in {1..100}
do
  aws lambda invoke --function-name ${LAMBDA_FUNCTION_ARN} --log-type Tail lambda-invoke-standard.json > output.json
  cat lambda-invoke-standard.json
  aws lambda update-function-configuration --function-name ${LAMBDA_FUNCTION_ARN} --description "lambda-$i"
done

check_lambda_output