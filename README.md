# graphql-algolia-transformer

[![Pull requests are welcome!](https://img.shields.io/badge/PRs-welcome-brightgreen)](#contribute-)
[![npm](https://img.shields.io/npm/v/graphql-algolia-transformer)](https://www.npmjs.com/package/graphql-algolia-transformer)
[![GitHub license](https://img.shields.io/github/license/thefinnomenon/graphql-algolia-transformer)](https://github.com/thefinnomenon/graphql-algolia-transformer/blob/master/LICENSE)

# Description
Add Serverless search to your Amplify API with Aloglia using this transformer.

# @algolia vs @searchable
I made this transformer because I didn't want the monthly costs for the Elasticsearch instances used by @searchable. Algolia is effortless to get started and is free for up to 10k records and searches per month which makes it perfect for MVPs. As your app grows, you should probably re-evaluate the pricing difference between Elasticsearch and Algolia but this point is probably when you reach ~500k records/searches. Also, Algolia comes with nice client-side search UIs that you can just drop into your app. An obvious downside to using Algolia instead of Elasticsearch is that it takes you outside of the AWS world but I think that it's worth the tradeoff.

# Use
## Install Transform

`npm install graphql-algolia-transformer`

## Import Transform

*/amplify/backend/api/<API_NAME>/transform.conf.json*

```json
{
    ...
    "transformers": [
        ...,
        "graphql-algolia-transformer"
    ]
}
```

## Use @algolia directive

Append `@algolia(fields?: {include?: [string], exclude?: [string]})` to target objects.

```graphql
type Blog @model @algolia(fields:{include:["name"]}) {
  id: ID!
  name: String!
  posts: [Post] @connection(keyName: "byBlog", fields: ["id"])
}

type Post @model @algolia(fields:{include:["title"]}) @key(name: "byBlog", fields: ["blogID"]) {
  id: ID!
  title: String!
  blogID: ID!
  blog: Blog @connection(fields: ["blogID"])
  comments: [Comment] @connection(keyName: "byPost", fields: ["id"])
}

type Comment @model @algolia(fields:{include:["content"]}) @key(name: "byPost", fields: ["postID", "content"]) {
  id: ID!
  postID: ID!
  post: Post @connection(fields: ["postID"])
  content: String!
}
```

- You cannot specify include and exclude in the same fields parameter.
- The Algolia ObjectID is a concatenation of the DynamoDB keys for the object; PrimaryKey(:SortKey).
- Automatically creates an index with the model name (e.g. Blog).

## Configure API Keys
*/amplify/backend/api/<API_NAME>/parameters.json*

```json
{
  ...
  "AlgoliaAppIdBlog": "APPID",
  "AlgoliaApiKeyBlog": "APIKEY",
  "AlgoliaAppIdPost": "APPID",
  "AlgoliaApiKeyPost": "APIKEY",
  "AlgoliaAppIdComment": "APPID",
  "AlgoliaApiKeyComment": "APIKEY"
}
```

**Unfortunately, you have to define these parameters for each model that has the @algolia directive.** I can't declare the parameters AlogliaAppId and AlgoliaApiKey in each stack because it complains about the parameters name conflicting. I also tried exporting them from CustomResources.json but couldn't get it to work. This is a good issue to work on if you want to contribute.

## Push Changes
`amplify push`

## Query
For querying the search indexes, use an [Algolia search client](https://www.algolia.com/developers/#integrations).

## How it works
This directive creates an individual Lambda function for each declaration and attaches a DynamoDB stream from the respective table to the function. On receiving a stream, the function filters the fields as specified, formats the record into an Algolia payload and updates the Algolia index with the model name (if it doesn't exist, it creates it).

## Contribute
Contributions are more than welcome!

Please feel free to create, comment and of course solve some of the issues. To get started you can also go for the easier issues marked with the `good first issue` label if you like.

### Development
- `npm run lambda` uses SAM to invoke the Lambda function. You need to supply an App ID and API Key in `template.yaml`.
- `amplify api gql-compile` lets you check the stack outputs without having to go through the lengthy push process.

## License
The [MIT License](LICENSE)

## Credits

The _graphql-algolia-transformer_ library is maintained by Chris Finn [The Finnternet](https://thefinnternet.com).

Based on [graphql-elasticsearch-transformer](https://github.com/aws-amplify/amplify-cli/tree/master/packages/graphql-elasticsearch-transformer)
