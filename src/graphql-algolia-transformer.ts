import {
  TransformerPluginBase, InvalidDirectiveError, DirectiveWrapper,
} from '@aws-amplify/graphql-transformer-core';
import {
  TransformerContextProvider,
  TransformerSchemaVisitStepContextProvider,
  TransformerTransformSchemaStepContextProvider,
} from '@aws-amplify/graphql-transformer-interfaces';
import { DynamoDbDataSource, LambdaDataSource, CfnResolver, CfnDataSource } from '@aws-cdk/aws-appsync';
import { Table } from '@aws-cdk/aws-dynamodb';
import { IFunction } from '@aws-cdk/aws-lambda';
import {
  CfnCondition, CfnParameter, Fn, IConstruct,
} from '@aws-cdk/core';
import { DirectiveNode, FieldDefinitionNode, ObjectTypeDefinitionNode } from 'graphql';
import {
  ResourceConstants,
  ModelResourceIDs,
  graphqlName,
  plurality,
  toUpper,
  makeField,
  makeInputValueDefinition,
  makeNamedType
} from 'graphql-transformer-common';
import { createParametersStack as createParametersInStack } from './cdk/create-cfnParameters';

import { setMappings } from './cdk/create-layer-cfnMapping';
import { createEventSourceMapping, createLambda, createLambdaRole } from './cdk/create-streaming-lambda';
import { AlgoliaDirectiveArgs, FieldList } from './directive-args';

const STACK_NAME = 'AlgoliaStack';
const directiveName = "algolia";
const RESPONSE_MAPPING_TEMPLATE = `
#if( $ctx.error )
  $util.error($ctx.error.message, $ctx.error.type)
#else
  $util.parseJson($ctx.result)
#end
`;

interface SearchableObjectTypeDefinition {
  node: ObjectTypeDefinitionNode;
  fieldName: string,
  fieldNameRaw: string,
  directiveArguments:
  AlgoliaDirectiveArgs
}
export class AlgoliaTransformer extends TransformerPluginBase {
  searchableObjectTypeDefinitions: SearchableObjectTypeDefinition[];
  constructor() {
    super(
      'graphql-algolia-transformer',
      /* GraphQL */ `
        directive @${ directiveName }(fields: FieldList, settings: AWSJSON) on OBJECT
        input FieldList {
          include: [String]
          exclude: [String]
        }
      `,
    );
    this.searchableObjectTypeDefinitions = [];
  }

  generateResolvers = (context: TransformerContextProvider): void => {
    const { Env } = ResourceConstants.PARAMETERS;
    const { HasEnvironmentParameter } = ResourceConstants.CONDITIONS;

    const stack = context.stackManager.createStack(STACK_NAME);

    // creates region mapping for stack
    setMappings(stack);

    const envParam = context.stackManager.getParameter(Env) as CfnParameter;
    // eslint-disable-next-line no-new
    new CfnCondition(stack, HasEnvironmentParameter, {
      expression: Fn.conditionNot(Fn.conditionEquals(envParam, ResourceConstants.NONE)),
    });

    stack.templateOptions.description = 'An auto-generated nested stack for algolia.';
    stack.templateOptions.templateFormatVersion = '2010-09-09';

    // creates parameters map
    const defaultFieldParams = this.searchableObjectTypeDefinitions.reduce((acc, { fieldNameRaw, directiveArguments }) => {
      return { [fieldNameRaw]: directiveArguments.fields, ...acc }
    }, {} as Record<string, FieldList>);
    const defaultSettingsParams = this.searchableObjectTypeDefinitions.reduce((acc, { fieldNameRaw, directiveArguments }) => {
      return { [fieldNameRaw]: directiveArguments.settings, ...acc }
    }, {} as Record<string, string>);
    const parameterMap = createParametersInStack(context.stackManager.rootStack, defaultFieldParams, defaultSettingsParams);


    // streaming lambda role
    const lambdaRole = createLambdaRole(context, stack, parameterMap);

    // creates algolia lambda
    const lambda = createLambda(
      stack,
      context.api,
      parameterMap,
      lambdaRole,
    );

    // add lambda as data source for the search queries
    const dataSource = context.api.host.addLambdaDataSource(
      `searchResolverDataSource`,
      lambda,
      {},
      stack
    );

    // creates event source mapping for each table
    createSourceMappings(this.searchableObjectTypeDefinitions, context, lambda, parameterMap, dataSource);
  };

  object = (definition: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerSchemaVisitStepContextProvider): void => {
    validateModelDirective(definition);

    const directiveArguments = getDirectiveArguments(directive);

    const fieldName = graphqlName(`search${ plurality(toUpper(definition.name.value), true) }`);

    this.searchableObjectTypeDefinitions.push({
      node: definition,
      fieldName,
      fieldNameRaw: definition.name.value,
      directiveArguments,
    });

  };

  transformSchema = (ctx: TransformerTransformSchemaStepContextProvider) => {
    const fields: FieldDefinitionNode[] = [];

    // For each model that has been annotated with @algolia
    for (const model of this.searchableObjectTypeDefinitions) {

      // Add the search query field to the schema
      // e.g. searchBlogs(query: String): AWSJSON
      fields.push(
        makeField(
          model.fieldName,
          [makeInputValueDefinition("query", makeNamedType("String"))],
          makeNamedType("AWSJSON"),
        )
      );
    }

    ctx.output.addQueryFields(fields);
  };

}

const validateModelDirective = (object: ObjectTypeDefinitionNode): void => {
  const modelDirective = object.directives!.find(
    (dir) => dir.name.value === "model"
  );
  if (!modelDirective) {
    throw new InvalidDirectiveError(
      `Types annotated with @${ directiveName } must also be annotated with @model.`
    );
  }
}

const getTable = (context: TransformerContextProvider, definition: ObjectTypeDefinitionNode): {table:IConstruct, tableConfig:CfnDataSource.DynamoDBConfigProperty} => {
  const ddbDataSource = context.dataSources.get(definition) as DynamoDbDataSource;
  const tableName = ModelResourceIDs.ModelTableResourceID(definition.name.value);
  const table = ddbDataSource.ds.stack.node.findChild(tableName);
  return {table, tableConfig: ddbDataSource.ds.dynamoDbConfig as CfnDataSource.DynamoDBConfigProperty};
};

const getDirectiveArguments = (directive: DirectiveNode): AlgoliaDirectiveArgs => {
  const directiveWrapped = new DirectiveWrapper(directive);
  return directiveWrapped.getArguments({
    fields: undefined,
    settings: undefined,
  }) as (AlgoliaDirectiveArgs);
}

const createSourceMappings = (searchableObjectTypeDefinitions: SearchableObjectTypeDefinition[], context: TransformerContextProvider, lambda: IFunction, parameterMap: Map<string, CfnParameter>, lambdaDataSource: LambdaDataSource): void => {
  const stack = context.stackManager.getStack(STACK_NAME);
  for (const def of searchableObjectTypeDefinitions) {
    const type = def.node.name.value;
    const openSearchIndexName = context.resourceHelper.getModelNameMapping(type);
    const tableData = getTable(context, def.node);
    const ddbTable = tableData.table as Table;
    if (!ddbTable) {
      throw new Error('Failed to find ddb table for searchable');
    }

    ddbTable.grantStreamRead(lambda.role);

    // creates event source mapping from ddb to lambda
    if (!ddbTable.tableStreamArn) {
      throw new Error('tableStreamArn is required on ddb table ot create event source mappings');
    }
    createEventSourceMapping(stack, openSearchIndexName, lambda, parameterMap, ddbTable.tableStreamArn);

    // Connect the resolver to the API
    const resolver = new CfnResolver(
      stack,
      `${def.fieldNameRaw}SearchResolver`,
      {
        apiId: context.api.apiId,
        fieldName: def.fieldName,
        typeName: "Query",
        kind: "UNIT",
        dataSourceName: lambdaDataSource?.ds.attrName,
        requestMappingTemplate: getRequestMappingTemplate(tableData.tableConfig.tableName),
        responseMappingTemplate: RESPONSE_MAPPING_TEMPLATE,
      }
    );

    // resolver.overrideLogicalId(resourceId);
    context.api.addSchemaDependency(resolver);
  }
}

const getRequestMappingTemplate = (tableName:string) => `
$util.toJson({ "version": "2018-05-29", "operation": "Invoke", "payload": $util.toJson({ "typeName": "Query", "tableName": "${tableName}", "arguments": $util.toJson($ctx.args) }) })
`;