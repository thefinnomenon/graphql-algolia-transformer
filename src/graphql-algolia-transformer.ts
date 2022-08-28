import {
  TransformerPluginBase, InvalidDirectiveError, DirectiveWrapper,
} from '@aws-amplify/graphql-transformer-core';
import {
  TransformerContextProvider,
  TransformerPrepareStepContextProvider,
  TransformerSchemaVisitStepContextProvider,
} from '@aws-amplify/graphql-transformer-interfaces';
import { DynamoDbDataSource } from '@aws-cdk/aws-appsync';
import { Table } from '@aws-cdk/aws-dynamodb';
import {
  CfnCondition, CfnParameter, Fn, IConstruct,
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

const STACK_NAME = 'AlgoliaStack';

export class AlgoliaTransformer extends TransformerPluginBase {
  searchableObjectTypeDefinitions: { node: ObjectTypeDefinitionNode; fieldName: string }[];
  searchableObjectNames: string[];
  constructor() {
    super(
      'graphql-algolia-transformer',
      /* GraphQL */ `
        directive @algolia on OBJECT
      `,
    );
    this.searchableObjectTypeDefinitions = [];
    this.searchableObjectNames = [];
  }

  generateResolvers = (context: TransformerContextProvider): void => {
    const { Env } = ResourceConstants.PARAMETERS;

    console.log(context.getResolverConfig())
    console.log(context.inputDocument.definitions)

    // console.log({params:ResourceConstants.PARAMETERS})

    const { HasEnvironmentParameter } = ResourceConstants.CONDITIONS;

    const stack = context.stackManager.createStack(STACK_NAME);

    setMappings(stack);

    const envParam = context.stackManager.getParameter(Env) as CfnParameter;

    // eslint-disable-next-line no-new
    new CfnCondition(stack, HasEnvironmentParameter, {
      expression: Fn.conditionNot(Fn.conditionEquals(envParam, ResourceConstants.NONE)),
    });

    const isProjectUsingDataStore = context.isProjectUsingDataStore();

    stack.templateOptions.description = 'An auto-generated nested stack for searchable.';
    stack.templateOptions.templateFormatVersion = '2010-09-09';

    const parameterMap = createParametersInStack(context.stackManager.rootStack);


    // streaming lambda role
    const lambdaRole = createLambdaRole(context, stack, parameterMap);


    // creates streaming lambda
    const lambda = createLambda(
      stack,
      context.api,
      parameterMap,
      lambdaRole,
      isProjectUsingDataStore,
    );
    console.log("created lambda...");

    for (const def of this.searchableObjectTypeDefinitions) {
      const type = def.node.name.value;
      const openSearchIndexName = context.resourceHelper.getModelNameMapping(type);
      const fields = def.node.fields?.map((f) => f.name.value) ?? [];
      const typeName = context.output.getQueryTypeName();
      const table = getTable(context, def.node);
      const ddbTable = table as Table;
      if (!ddbTable) {
        throw new Error('Failed to find ddb table for searchable');
      }

      ddbTable.grantStreamRead(lambdaRole);

      // creates event source mapping from ddb to lambda
      if (!ddbTable.tableStreamArn) {
        throw new Error('tableStreamArn is required on ddb table ot create event source mappings');
      }
      createEventSourceMapping(stack, openSearchIndexName, lambda, parameterMap, ddbTable.tableStreamArn);
      console.log("created trigger");

      // const { attributeName } = (table as any).keySchema.find((att: any) => att.keyType === 'HASH');
      // const keyFields = getKeyFields(attributeName, table);

      // if (!typeName) {
      //   throw new Error('Query type name not found');
      // }
      // const resolver = context.resolvers.generateQueryResolver(
      //   typeName,
      //   def.fieldName,
      //   ResolverResourceIDs.ElasticsearchSearchResolverResourceID(type),
      //   datasource as DataSourceProvider,
      //   MappingTemplate.s3MappingTemplateFromString(
      //     requestTemplate(
      //       attributeName,
      //       getNonKeywordFields((context.output.getObject(type))as ObjectTypeDefinitionNode),
      //       context.isProjectUsingDataStore(),
      //       openSearchIndexName,
      //       keyFields,
      //     ),
      //     `${typeName}.${def.fieldName}.req.vtl`,
      //   ),
      //   MappingTemplate.s3MappingTemplateFromString(
      //     responseTemplate(context.isProjectUsingDataStore()),
      //     `${typeName}.${def.fieldName}.res.vtl`,
      //   ),
      // );
      // resolver.addToSlot(
      //   'postAuth',
      //   MappingTemplate.s3MappingTemplateFromString(
      //     sandboxMappingTemplate(context.sandboxModeEnabled, fields),
      //     `${typeName}.${def.fieldName}.{slotName}.{slotIndex}.res.vtl`,
      //   ),
      // );

      // resolver.mapToStack(stack);
      // context.resolvers.addResolver(typeName, def.fieldName, resolver);
    }

    // createStackOutputs(stack, domain.domainEndpoint, context.api.apiId, domain.domainArn);



  };

  object = (definition: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerSchemaVisitStepContextProvider): void => {
    const modelDirective = definition?.directives?.find((dir) => dir.name.value === 'model');
    const hasAuth = definition.directives?.some((dir) => dir.name.value === 'auth') ?? false;
    if (!modelDirective) {
      throw new InvalidDirectiveError('Types annotated with @searchable must also be annotated with @model.');
    }

    const directiveWrapped = new DirectiveWrapper(directive);
    const directiveArguments = directiveWrapped.getArguments({}) as any;
    let shouldMakeSearch = true;
    let searchFieldNameOverride;

    if (directiveArguments.queries) {
      if (!directiveArguments.queries.search) {
        shouldMakeSearch = false;
      } else {
        searchFieldNameOverride = directiveArguments.queries.search;
      }
    }
    const fieldName = searchFieldNameOverride ?? graphqlName(`search${plurality(toUpper(definition.name.value), true)}`);
    this.searchableObjectTypeDefinitions.push({
      node: definition,
      fieldName,
    });
  };

  prepare = (ctx: TransformerPrepareStepContextProvider): void => {
    // register search query resolvers in field mapping
    // if no mappings are registered elsewhere, this won't do anything
    // but if mappings are defined this will ensure the mapping is also applied to the search results
    for (const def of this.searchableObjectTypeDefinitions) {
      const modelName = def.node.name.value;
      ctx.resourceHelper.getModelFieldMap(modelName).addResolverReference({ typeName: 'Query', fieldName: def.fieldName, isList: true });
    }
  };

  
}

const getTable = (context: TransformerContextProvider, definition: ObjectTypeDefinitionNode): IConstruct => {
  const ddbDataSource = context.dataSources.get(definition) as DynamoDbDataSource;
  const tableName = ModelResourceIDs.ModelTableResourceID(definition.name.value);
  const table = ddbDataSource.ds.stack.node.findChild(tableName);
  return table;
};