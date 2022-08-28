import { ResourceConstants } from 'graphql-transformer-common';
import { CfnParameter, Stack } from '@aws-cdk/core';

  const AlgoliaProjectId = "AlgoliaProjectId";
  const AlgoliaAppId = "AlgoliaAppId";
  const AlgoliaApiKey = "AlgoliaApiKey";
  const AlgoliaFields = "AlgoliaFields";
  const AlgoliaSettings = "AlgoliaSettings";

  export const ALGOLIA_PARAMS = {
    AlgoliaProjectId,
    AlgoliaAppId,
    AlgoliaApiKey,
    AlgoliaFields,
    AlgoliaSettings
  }

export const createParametersStack = (stack: Stack): Map<string, CfnParameter> => {
  const {
    OpenSearchAccessIAMRoleName,
    OpenSearchStreamingLambdaHandlerName,
    OpenSearchStreamingLambdaRuntime,
    OpenSearchStreamingFunctionName,
    OpenSearchStreamBatchSize,
    OpenSearchStreamMaximumBatchingWindowInSeconds,
    OpenSearchStreamingIAMRoleName,
    OpenSearchDebugStreamingLambda,
  } = ResourceConstants.PARAMETERS;

  

  return new Map<string, CfnParameter>([
    [
      AlgoliaProjectId,
      new CfnParameter(stack, AlgoliaProjectId, {
        description: 'Algolia Project ID.',
        default: "",
      }),
    ],
    [
      AlgoliaAppId,
      new CfnParameter(stack, AlgoliaAppId, {
        description: 'Algolia App ID.',
        default: "",
      }),
    ],
    [
      AlgoliaApiKey,
      new CfnParameter(stack, AlgoliaApiKey, {
        description: 'Algolia API Key.',
        default: "",
      }),
    ],
    [
      AlgoliaFields,
      new CfnParameter(stack, AlgoliaFields, {
        description: 'An object specifying fields to either include in or exclude from the Angolia Index.',
        default: "",
      }),
    ],
    [
      AlgoliaSettings,
      new CfnParameter(stack, AlgoliaSettings, {
        description: 'The Angolia Index Settings. { settings: {...}, forwardsToReplica?: boolean, requestOptions?: {...} }',
        default: "",
      }),
    ],
    [
      OpenSearchAccessIAMRoleName,
      new CfnParameter(stack, OpenSearchAccessIAMRoleName, {
        description: 'The name of the IAM role assumed by AppSync for OpenSearch.',
        default: 'AppSyncOpenSearchRole',
      }),
    ],

    [
      OpenSearchStreamingLambdaHandlerName,
      new CfnParameter(stack, OpenSearchStreamingLambdaHandlerName, {
        description: 'The name of the lambda handler.',
        default: 'python_algolia_function.lambda_handler',
      }),
    ],

    [
      OpenSearchStreamingLambdaRuntime,
      new CfnParameter(stack, OpenSearchStreamingLambdaRuntime, {
        // eslint-disable-next-line no-multi-str
        description: 'The lambda runtime \
                (https://docs.aws.amazon.com/lambda/latest/dg/API_CreateFunction.html#SSS-CreateFunction-request-Runtime)',
        default: 'python3.6',
      }),
    ],

    [
      OpenSearchStreamingFunctionName,
      new CfnParameter(stack, OpenSearchStreamingFunctionName, {
        description: 'The name of the streaming lambda function.',
        default: 'DdbToEsFn',
      }),
    ],

    [
      OpenSearchStreamBatchSize,
      new CfnParameter(stack, OpenSearchStreamBatchSize, {
        description: 'The maximum number of records to stream to OpenSearch per batch.',
        type: 'Number',
        default: 100,
      }),
    ],

    [
      OpenSearchStreamMaximumBatchingWindowInSeconds,
      new CfnParameter(stack, OpenSearchStreamMaximumBatchingWindowInSeconds, {
        description: 'The maximum amount of time in seconds to wait for DynamoDB stream records before sending to streaming lambda.',
        type: 'Number',
        default: 1,
      }),
    ],

    [
      OpenSearchAccessIAMRoleName,
      new CfnParameter(stack, OpenSearchStreamingIAMRoleName, {
        description: 'The name of the streaming lambda function IAM role.',
        default: 'SearchLambdaIAMRole',
      }),
    ],

    [
      OpenSearchDebugStreamingLambda,
      new CfnParameter(stack, OpenSearchDebugStreamingLambda, {
        description: 'Enable debug logs for the Dynamo -> OpenSearch streaming lambda.',
        default: 0,
        type: 'Number',
        allowedValues: ['0', '1'],
      }),
    ],
  ]);
};