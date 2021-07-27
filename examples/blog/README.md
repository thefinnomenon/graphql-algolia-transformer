# Searchable Blog Example
This JavaScript Amplify app creates an API for a blog and uses the @algolia directive on the Post model to make Posts searchable by title.

![Demo Screenshot](./demo.png "Demo Screenshot")

# Run Example
1. Add your Algolia App ID and API Key to `paramaters.json` and to `app.js`.
2. Install the dependencies - `npm install`
3. Create the backend - `amplify push`
4. Open the Amplify console - `amplify console api`
5. Use the query tab to create a Blog and create a bunch of Posts.
6. Start the frontend - `npm start`
7. Use the search bar to search through the posts you added.
