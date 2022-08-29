import {
  TransformerPluginBase, InvalidDirectiveError, DirectiveWrapper,
} from '@aws-amplify/graphql-transformer-core';
import {
  TransformerContextProvider,
  TransformerSchemaVisitStepContextProvider,
} from '@aws-amplify/graphql-transformer-interfaces';
import { DynamoDbDataSource } from '@aws-cdk/aws-appsync';
import { Table } from '@aws-cdk/aws-dynamodb';
import { IFunction } from '@aws-cdk/aws-lambda';
import {
  CfnCondition, CfnParameter, Construct, Fn, IConstruct,
} from '@aws-cdk/core';
import { DirectiveNode, ObjectTypeDefinitionNode } from 'graphql';
import {
  ResourceConstants,
  ModelResourceIDs,
  graphqlName,
  plurality,
  toUpper
} from 'graphql-transformer-common';
import { createParametersStack as createParametersInStack } from './cdk/create-cfnParameters';

import { setMappings } from './cdk/create-layer-cfnMapping';
import { createEventSourceMapping, createLambda, createLambdaRole } from './cdk/create-streaming-lambda';
import { AlgoliaDirectiveArgs, FieldList } from './directive-args';

const STACK_NAME = 'AlgoliaStack';
const directiveName = "algolia";

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
        directive @${ directiveName }(fields: FieldList) on OBJECT
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

    // creates event source mapping for each table
    createSourceMappings(this.searchableObjectTypeDefinitions, context, lambda, parameterMap);
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

const getTable = (context: TransformerContextProvider, definition: ObjectTypeDefinitionNode): IConstruct => {
  const ddbDataSource = context.dataSources.get(definition) as DynamoDbDataSource;
  const tableName = ModelResourceIDs.ModelTableResourceID(definition.name.value);
  const table = ddbDataSource.ds.stack.node.findChild(tableName);
  return table;
};

const getDirectiveArguments = (directive: DirectiveNode): AlgoliaDirectiveArgs => {
  const directiveWrapped = new DirectiveWrapper(directive);
  return directiveWrapped.getArguments({
    fields: undefined,
    settings: undefined,
  }) as (AlgoliaDirectiveArgs);
}

const createSourceMappings = (searchableObjectTypeDefinitions: SearchableObjectTypeDefinition[], context: TransformerContextProvider, lambda: IFunction, parameterMap: Map<string, CfnParameter>): void => {
  const stack = context.stackManager.getStack(STACK_NAME);
  for (const def of searchableObjectTypeDefinitions) {
    const type = def.node.name.value;
    const openSearchIndexName = context.resourceHelper.getModelNameMapping(type);
    const table = getTable(context, def.node);
    const ddbTable = table as Table;
    if (!ddbTable) {
      throw new Error('Failed to find ddb table for searchable');
    }

    ddbTable.grantStreamRead(lambda.role);

    // creates event source mapping from ddb to lambda
    if (!ddbTable.tableStreamArn) {
      throw new Error('tableStreamArn is required on ddb table ot create event source mappings');
    }
    createEventSourceMapping(stack, openSearchIndexName, lambda, parameterMap, ddbTable.tableStreamArn);
  }
}