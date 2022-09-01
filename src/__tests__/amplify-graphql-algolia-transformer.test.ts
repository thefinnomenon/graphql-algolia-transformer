import { GraphQLTransform } from '@aws-amplify/graphql-transformer-core';
import { ModelTransformer } from '@aws-amplify/graphql-model-transformer';
import { expect as cdkExpect, haveResource,
} from '@aws-cdk/assert';
import { parse } from 'graphql';
import { AlgoliaTransformer } from '../graphql-algolia-transformer';

const featureFlags = {
  getBoolean: jest.fn().mockImplementation((name): boolean => {
    if (name === 'improvePluralization') {
      return true;
    }
    return false;
  }),
  getNumber: jest.fn(),
  getObject: jest.fn(),
};

test('AlgoliaTransformer validation happy case', () => {
  const validSchema = `
    type Post @model @algolia {
        id: ID!
        title: String!
        createdAt: String
        updatedAt: String
    }
    `;
  const transformer = new GraphQLTransform({
    transformers: [new ModelTransformer(), new AlgoliaTransformer()],
    featureFlags,
  });
  const out = transformer.transform(validSchema);
  expect(out).toBeDefined();
  parse(out.schema);
  expect(out.schema).toMatchSnapshot();
});

test('AlgoliaTransformer vtl', () => {
  const validSchema = `
    type Post @model @algolia {
        id: ID!
        title: String!
        createdAt: String
        updatedAt: String
    }
    `;
  const transformer = new GraphQLTransform({
    transformers: [new ModelTransformer(), new AlgoliaTransformer()],
    featureFlags,
  });

  const out = transformer.transform(validSchema);
  expect(parse(out.schema)).toBeDefined();
  expect(out.resolvers).toMatchSnapshot();
});

test('AlgoliaTransformer with query overrides', () => {
  const validSchema = `type Post @model @algolia(fields:{include:["title"], exclude:["createdAt"]}, settings:{field:"value"} ) {
        id: ID!
        title: String!
        createdAt: String
        updatedAt: String
    }
    `;
  const transformer = new GraphQLTransform({
    transformers: [new ModelTransformer(), new AlgoliaTransformer()],
    featureFlags,
  });
  const out = transformer.transform(validSchema);
  expect(out).toBeDefined();
  expect(parse(out.schema)).toBeDefined();
  expect(out.schema).toMatchSnapshot();
});

test('AlgoliaTransformer with only create mutations', () => {
  const validSchema = `type Post @model(mutations: { create: "customCreatePost" }) @algolia {
        id: ID!
        title: String!
        createdAt: String
        updatedAt: String
    }
    `;
  const transformer = new GraphQLTransform({
    transformers: [new ModelTransformer(), new AlgoliaTransformer()],
    featureFlags,
  });
  const out = transformer.transform(validSchema);
  expect(out).toBeDefined();
  expect(out.schema).toBeDefined();
  expect(out.schema).toMatchSnapshot();
});

test('AlgoliaTransformer with multiple model algolia directives', () => {
  const validSchema = `
    type Post @model @algolia {
        id: ID!
        title: String!
        createdAt: String
        updatedAt: String
    }

    type User @model @algolia {
        id: ID!
        name: String!
    }
    `;
  const transformer = new GraphQLTransform({
    transformers: [new ModelTransformer(), new AlgoliaTransformer()],
    featureFlags,
  });
  const out = transformer.transform(validSchema);
  expect(out).toBeDefined();
  expect(out.schema).toBeDefined();
  expect(out.schema).toMatchSnapshot();
});

test('AlgoliaTransformer with sort fields', () => {
  const validSchema = `
    type Post @model @algolia {
        id: ID!
        title: String!
        createdAt: String
        updatedAt: String
    }
    `;
  const transformer = new GraphQLTransform({
    transformers: [new ModelTransformer(), new AlgoliaTransformer()],
    featureFlags,
  });
  const out = transformer.transform(validSchema);
  expect(out).toBeDefined();
  expect(out.schema).toBeDefined();
  expect(out.schema).toMatchSnapshot();
});

test('AlgoliaTransformer generates expected resources', () => {
  const validSchema = `
    type Post @model @algolia {
        id: ID!
        title: String!
        createdAt: String
        updatedAt: String
    }
    type Todo @model @algolia {
        id: ID!
        name: String!
        description: String
        createdAt: String
        updatedAt: String
    }
    type Comment @model {
      id: ID!
      content: String!
    }
 `;
  const transformer = new GraphQLTransform({
    transformers: [new ModelTransformer(), new AlgoliaTransformer()],
    featureFlags,
  });
  const out = transformer.transform(validSchema);
  expect(out).toBeDefined();
  const algoliaStack = out.stacks.AlgoliaStack;
  cdkExpect(algoliaStack).to(
    haveResource('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
          },
        ],
        Version: '2012-10-17',
      },
    }),
  );
});
