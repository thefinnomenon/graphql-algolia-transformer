import Amplify from "aws-amplify";

import algoliasearch from 'algoliasearch/lite';
import instantsearch from 'instantsearch.js';
import { searchBox, hits } from 'instantsearch.js/es/widgets';
const searchClient = algoliasearch('YOUR_ALGOLIA_APP_ID', 'YOUR_ALGOLIA_SEARCH_KEY');
const indexName = 'YOUR_ALGOLIA_INDEX_NAME';
import awsconfig from "./aws-exports";

Amplify.configure(awsconfig);

const search = instantsearch({
    indexName,
    searchClient,
});

search.addWidgets([
    searchBox({
        container: "#searchbox",
        placeholder: "Search for posts",
        autofocus: true,
        showReset: false,
        showSubmit: false,
    }),

    hits({
        container: '#hits',
        templates: {
            item: `
                <h1>
                    {{#helpers.highlight}}{ "attribute": "title" }{{/helpers.highlight}}
                </h1>
            `,
        },
    })
]);

search.start();