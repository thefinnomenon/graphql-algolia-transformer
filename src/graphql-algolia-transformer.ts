import { Transformer, TransformerContext, getDirectiveArguments, gql, InvalidDirectiveError } from 'graphql-transformer-core';
import { DirectiveNode, ObjectTypeDefinitionNode } from 'graphql';
import { ResourceFactory } from './resources';
import { SearchableResourceIDs } from 'graphql-transformer-common';
import path = require('path');

interface FieldList {
  include?: [string];
  exclude?: [string];
}
interface AlgoliaDirectiveArgs {
  fields?: FieldList;
  roleName?: String;
  functionName?: String;
  settings?: String;
}

/**
 * Handles the @algolia directive on OBJECT types.
 */
export class AlgoliaTransformer extends Transformer {
  resources: ResourceFactory;

  constructor() {
    super(
      `graphql-algolia-transform`,
      gql`
        directive @algolia(fields: FieldList, functionName: String, roleName: String, settings: AWSJSON) on OBJECT
        input FieldList {
          include: [String]
          exclude: [String]
        }
      `,
    );
    this.resources = new ResourceFactory();
  }

  /**
   * Given the initial input and context manipulate the context to handle this object directive.
   * @param initial The input passed to the transform.
   * @param ctx The accumulated context for the transform.
   */
  public object = (def: ObjectTypeDefinitionNode, directive: DirectiveNode, ctx: TransformerContext): void => {
    // Validate Object
    const modelDirective = def.directives.find(dir => dir.name.value === 'model');
    if (!modelDirective) {
      throw new InvalidDirectiveError('Types annotated with @algolia must also be annotated with @model.');
    }

    const STACK_NAME = `AlgoliaStack${def.name.value}`;

    // Retrieve Directive Arguments
    const directiveArgs: AlgoliaDirectiveArgs = getDirectiveArguments(directive);    
    
    // Create Template & add it to the Stack
    const template = this.resources.initTemplate(def.name.value, directiveArgs);
    ctx.mergeResources(template.Resources);
    ctx.mergeParameters(template.Parameters);
    ctx.mergeMappings(template.Mappings);
    ctx.metadata.set(
      this.resources.AlgoliaLambdaFunctionLogicalID,
      path.resolve(`${__dirname}/../lib/algolia-lambda.zip`),
    );
    for (const resourceId of Object.keys(template.Resources)) {
      ctx.mapResourceToStack(STACK_NAME, resourceId);
    }
    for (const mappingId of Object.keys(template.Mappings)) {
      ctx.mapResourceToStack(STACK_NAME, mappingId);
    }

    // Create EventSourceMapping & add it to the Stack
    const typeName = def.name.value;
    ctx.setResource(
      SearchableResourceIDs.SearchableEventSourceMappingID(typeName),
      this.resources.makeDynamoDBStreamEventSourceMapping(typeName),
    );
    ctx.mapResourceToStack(STACK_NAME, SearchableResourceIDs.SearchableEventSourceMappingID(typeName));
  };
}