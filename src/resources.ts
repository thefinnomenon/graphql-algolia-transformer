import IAM from 'cloudform-types/types/iam';
import Template from 'cloudform-types/types/template';
import { Fn, Lambda, StringParameter, NumberParameter } from 'cloudform-types';
import { ResourceConstants, ModelResourceIDs } from 'graphql-transformer-common';

export class ResourceFactory {
    AlgoliaProjectId = "AlgoliaProjectId";
    AlgoliaAppId = "AlgoliaAppId";
    AlgoliaApiKey = "AlgoliaApiKey";
    AlgoliaFields = "AlgoliaFields";
    AlgoliaSettings = "AlgoliaSettings";
    AlgoliaLambdaRuntime = 'AlgoliaLambdaRuntime';
    AlgoliaLambdaFunctionName = 'AlgoliaLambdaFunctionName';
    AlgoliaLambdaFunctionHandlerName = 'AlgoliaLambdaFunctionHandler';
    AlgoliaLambdaIAMRoleName = 'AlgoliaLambdaIAMRoleName';
    AlgoliaLambdaIAMRoleLogicalID = 'AlgoliaLambdaIAMRoleID';
    AlgoliaLambdaFunctionLogicalID = 'AlgoliaLambdaFunctionID';
    DebugAlgoliaLambda ='DebugAlgoliaLambda';

    private resetParams() {
        this.AlgoliaProjectId = "AlgoliaProjectId";
        this.AlgoliaAppId = "AlgoliaAppId";
        this.AlgoliaApiKey = "AlgoliaApiKey";
        this.AlgoliaFields = "AlgoliaFields";
        this.AlgoliaSettings = "AlgoliaSettings";
        this.AlgoliaLambdaRuntime = 'AlgoliaLambdaRuntime';
        this.AlgoliaLambdaFunctionName = 'AlgoliaLambdaFunctionName';
        this.AlgoliaLambdaFunctionHandlerName = 'AlgoliaLambdaFunctionHandler';
        this.AlgoliaLambdaIAMRoleName = 'AlgoliaLambdaIAMRoleName';
        this.AlgoliaLambdaIAMRoleLogicalID = 'AlgoliaLambdaIAMRoleID';
        this.AlgoliaLambdaFunctionLogicalID = 'AlgoliaLambdaFunctionID';
        this.DebugAlgoliaLambda = 'DebugAlgoliaLambda';
    }

    public makeParams(objectName, directiveArgs) {
        const { fields = '', roleName = `AlgoliaLambdaRole${objectName}`, functionName = `AlgoliaLambda${objectName}`, settings = '' } = directiveArgs;
        
        return {
            [this.AlgoliaProjectId]: new StringParameter({
                Description: 'Algolia Project ID.',
                Default: "",
            }),
            [this.AlgoliaAppId]: new StringParameter({
                Description: 'Algolia App ID.',
                Default: "",
            }),
            [this.AlgoliaApiKey]: new StringParameter({
                Description: 'Algolia API Key.',
                Default: "",
            }),
            [this.AlgoliaFields]: new StringParameter({
                Description: 'An object specifying fields to either include in or exclude from the Angolia Index.',
                Default: JSON.stringify(fields),
            }),
            [this.AlgoliaSettings]: new StringParameter({
                Description: 'The Angolia Index Settings. { settings: {...}, forwardsToReplica?: boolean, requestOptions?: {...} }',
                Default: JSON.stringify(settings),
            }),
            [this.AlgoliaLambdaRuntime]: new StringParameter({
                Description: `The Lambda runtime.`,
                Default: 'python3.8',
            }),
            [this.AlgoliaLambdaFunctionName]: new StringParameter({
                Description: 'The name of the Algolia lambda function.',
                Default: functionName,
            }),
            [this.AlgoliaLambdaFunctionHandlerName]: new StringParameter({
                Description: 'The name of the Algolia lambda handler.',
                Default: 'python_algolia_function.lambda_handler',
            }),            
            [this.AlgoliaLambdaIAMRoleName]: new StringParameter({
                Description: 'The name of the Algolia lambda function IAM role.',
                Default: roleName,
            }),
            [this.DebugAlgoliaLambda]: new NumberParameter({
                Description: 'Enable debug logs for the Dynamo -> Algolia lambda.',
                Default: 0,
                AllowedValues: [0, 1],
            }),
        };
    }

    /**
     * Creates the barebones template for an application.
     */
    public initTemplate(objectName, directiveArgs): Template {
        this.resetParams();
        const { functionName = `AlgoliaLambda${objectName}`, roleName = `AlgoliaLambdaRole${objectName}` } = directiveArgs;

        // Set Object specific names
        this.AlgoliaProjectId = `${this.AlgoliaProjectId}${objectName}`;
        this.AlgoliaAppId = `${this.AlgoliaAppId}${objectName}`;
        this.AlgoliaApiKey = `${this.AlgoliaApiKey}${objectName}`;
        this.AlgoliaFields = `${this.AlgoliaFields}${objectName}`;
        this.AlgoliaSettings = `${this.AlgoliaSettings}${objectName}`;
        this.AlgoliaLambdaRuntime = `${this.AlgoliaLambdaRuntime}${objectName}`;
        this.AlgoliaLambdaFunctionName = functionName;
        this.AlgoliaLambdaFunctionHandlerName = `${this.AlgoliaLambdaFunctionHandlerName}${objectName}`;
        this.AlgoliaLambdaIAMRoleName = roleName;
        this.AlgoliaLambdaIAMRoleLogicalID = `${this.AlgoliaLambdaIAMRoleLogicalID}${objectName}`;
        this.AlgoliaLambdaFunctionLogicalID = `${this.AlgoliaLambdaFunctionLogicalID}${objectName}`;
        this.DebugAlgoliaLambda = `${this.DebugAlgoliaLambda}${objectName}`;

        return {
            Parameters: this.makeParams(objectName, directiveArgs),
            Resources: {
                [this.AlgoliaLambdaIAMRoleLogicalID]: this.makeStreamingLambdaIAMRole(),
                [this.AlgoliaLambdaFunctionLogicalID]: this.makeDynamoDBStreamingFunction(objectName),
            },
            Mappings: this.getLayerMapping(objectName)
        };
    }

    public getLayerMapping(objectName): any {
        return {
            [`LayerResourceMapping${objectName}`]: {
                'ap-northeast-1': {
                    layerRegion: 'arn:aws:lambda:ap-northeast-1:249908578461:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'us-east-1': {
                    layerRegion: 'arn:aws:lambda:us-east-1:668099181075:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'ap-southeast-1': {
                    layerRegion: 'arn:aws:lambda:ap-southeast-1:468957933125:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'eu-west-1': {
                    layerRegion: 'arn:aws:lambda:eu-west-1:399891621064:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'us-west-1': {
                    layerRegion: 'arn:aws:lambda:us-west-1:325793726646:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'ap-east-1': {
                    layerRegion: 'arn:aws:lambda:ap-east-1:118857876118:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'ap-northeast-2': {
                    layerRegion: 'arn:aws:lambda:ap-northeast-2:296580773974:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'ap-northeast-3': {
                    layerRegion: 'arn:aws:lambda:ap-northeast-3:961244031340:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'ap-south-1': {
                    layerRegion: 'arn:aws:lambda:ap-south-1:631267018583:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'ap-southeast-2': {
                    layerRegion: 'arn:aws:lambda:ap-southeast-2:817496625479:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'ca-central-1': {
                    layerRegion: 'arn:aws:lambda:ca-central-1:778625758767:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'eu-central-1': {
                    layerRegion: 'arn:aws:lambda:eu-central-1:292169987271:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'eu-north-1': {
                    layerRegion: 'arn:aws:lambda:eu-north-1:642425348156:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'eu-west-2': {
                    layerRegion: 'arn:aws:lambda:eu-west-2:142628438157:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'eu-west-3': {
                    layerRegion: 'arn:aws:lambda:eu-west-3:959311844005:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'sa-east-1': {
                    layerRegion: 'arn:aws:lambda:sa-east-1:640010853179:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'us-east-2': {
                    layerRegion: 'arn:aws:lambda:us-east-2:259788987135:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'us-west-2': {
                    layerRegion: 'arn:aws:lambda:us-west-2:420165488524:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'cn-north-1': {
                    layerRegion: 'arn:aws-cn:lambda:cn-north-1:683298794825:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'cn-northwest-1': {
                    layerRegion: 'arn:aws-cn:lambda:cn-northwest-1:382066503313:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'us-gov-west-1': {
                    layerRegion: 'arn:aws-us-gov:lambda:us-gov-west-1:556739011827:layer:AWSLambda-Python-AWS-SDK:1',
                },
                'us-gov-east-1': {
                    layerRegion: 'arn:aws-us-gov:lambda:us-gov-east-1:138526772879:layer:AWSLambda-Python-AWS-SDK:1',
                },
            },
        };
    }

    /**
     * Deploy a lambda function that will stream data from our DynamoDB table to Algolia.
     */
    public makeDynamoDBStreamingFunction(objectName) {
        return new Lambda.Function({
            Code: {
                S3Bucket: Fn.Ref(ResourceConstants.PARAMETERS.S3DeploymentBucket),
                S3Key: Fn.Join('/', [
                    Fn.Ref(ResourceConstants.PARAMETERS.S3DeploymentRootKey),
                    'functions',
                    Fn.Join('.', [this.AlgoliaLambdaFunctionLogicalID, 'zip']),
                ]),
            },
            FunctionName: Fn.Join('-', [
                Fn.Ref(this.AlgoliaProjectId), 
                Fn.Ref(this.AlgoliaLambdaFunctionName)
            ]),
            Handler: Fn.Ref(this.AlgoliaLambdaFunctionHandlerName),
            Role: Fn.GetAtt(this.AlgoliaLambdaIAMRoleLogicalID, 'Arn'),
            Runtime: Fn.Ref(this.AlgoliaLambdaRuntime),
            Layers: [Fn.FindInMap(`LayerResourceMapping${objectName}`, Fn.Ref('AWS::Region'), 'layerRegion')],
            Environment: {
                Variables: {
                    DEBUG: Fn.Ref(this.DebugAlgoliaLambda),
                    ALGOLIA_PROJECT_ID: Fn.Ref(this.AlgoliaProjectId),
                    ALGOLIA_APP_ID: Fn.Ref(this.AlgoliaAppId),
                    ALGOLIA_API_KEY: Fn.Ref(this.AlgoliaApiKey),
                    ALGOLIA_FIELDS: Fn.Ref(this.AlgoliaFields),
                    ALGOLIA_SETTINGS: Fn.Ref(this.AlgoliaSettings)
                },
            },
        })
    }

    public makeDynamoDBStreamEventSourceMapping(typeName: string) {
        return new Lambda.EventSourceMapping({
            BatchSize: 1,
            Enabled: true,
            EventSourceArn: Fn.GetAtt(ModelResourceIDs.ModelTableResourceID(typeName), 'StreamArn'),
            FunctionName: Fn.GetAtt(this.AlgoliaLambdaFunctionLogicalID, 'Arn'),
            StartingPosition: 'LATEST',
        }).dependsOn([this.AlgoliaLambdaFunctionLogicalID]);
    }

    /**
     * Create a single role that has access to all the resources created by the
     * transform.
     */
    public makeStreamingLambdaIAMRole() {
        return new IAM.Role({
            RoleName: Fn.Join('-', [
                Fn.Ref(this.AlgoliaProjectId),
                Fn.Ref(this.AlgoliaLambdaIAMRoleName)
            ]),
            AssumeRolePolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: 'lambda.amazonaws.com',
                        },
                        Action: 'sts:AssumeRole',
                    },
                ],
            },
            Policies: [
                new IAM.Role.Policy({
                    PolicyName: 'DynamoDBStreamAccess',
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Action: ['dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator', 'dynamodb:ListStreams'],
                                Effect: 'Allow',
                                Resource: [
                                    '*',
                                    // TODO: Scope this to each table individually.
                                    // Fn.Join(
                                    //     '/',
                                    //     [Fn.GetAtt(ResourceConstants.RESOURCES.DynamoDBModelTableLogicalID, 'Arn'), '*']
                                    // )
                                ],
                            },
                        ],
                    },
                }),
                new IAM.Role.Policy({
                    PolicyName: 'CloudWatchLogsAccess',
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                                Resource: 'arn:aws:logs:*:*:*',
                            },
                        ],
                    },
                }),
            ],
        });
        // .dependsOn(ResourceConstants.RESOURCES.DynamoDBModelTableLogicalID)
    }
}