const assert = require('node:assert/strict');
const { buildSchema, graphql } = require('graphql');
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');
const neo4j = require('neo4j-driver');


const SCHEMA = `
type Query {
  user(id: ID!): User
}

type User {
  id: ID!
  name: String!
  posts: [Post!]!
  profile: Profile
  follows: [User!]!
}

type Post {
  id: ID!
  title: String!
}

type Profile {
  theme: String!
  favoriteEditor: String!
}
`;


function rowToUser(row) {
  return row === undefined ? null : { id: String(row.id), name: row.name };
}


async function resolveUser(_source, { id }, context) {
  // TODO: PostgreSQL user lookup
  throw new Error('Not implemented');
}


async function resolvePosts(user, _args, context) {
  // TODO: PostgreSQL post lookup
  throw new Error('Not implemented');
}


async function resolveProfile(user, _args, context) {
  // TODO: MongoDB profile lookup
  throw new Error('Not implemented');
}


async function resolveFollows(user, _args, context) {
  // TODO: Neo4j neighbors and PostgreSQL hydration
  throw new Error('Not implemented');
}


function makeSchema() {
  const schema = buildSchema(SCHEMA);
  schema.getType('Query').getFields().user.resolve = resolveUser;
  schema.getType('User').getFields().posts.resolve = resolvePosts;
  schema.getType('User').getFields().profile.resolve = resolveProfile;
  schema.getType('User').getFields().follows.resolve = resolveFollows;
  return schema;
}


const QUERY = `
query Dashboard($id: ID!) {
  user(id: $id) {
    id
    name
    posts { id title }
    profile { theme favoriteEditor }
    follows { id name }
  }
}
`;


async function openContext() {
  const postgres = new Pool({ connectionString: process.env.POSTGRES_URL });
  const mongoClient = new MongoClient(process.env.MONGO_URL);
  const graph = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  );
  await Promise.all([
    postgres.query('SELECT 1'),
    mongoClient.connect(),
    graph.verifyConnectivity(),
  ]);
  return {
    postgres,
    mongo: mongoClient.db(process.env.MONGO_DB),
    mongoClient,
    graph,
  };
}


async function main() {
  const context = await openContext();
  try {
    const result = await graphql({
      schema: makeSchema(),
      source: QUERY,
      variableValues: { id: '1' },
      contextValue: context,
    });

    assert.equal(
      result.errors,
      undefined,
      result.errors?.map((error) => error.message).join('\n'),
    );
    const data = JSON.parse(JSON.stringify(result.data));
    assert.deepEqual(data, {
      user: {
        id: '1',
        name: 'Alice',
        posts: [
          { id: '101', title: 'Recursive SQL' },
          { id: '102', title: 'Document Joins' },
        ],
        profile: { theme: 'dark', favoriteEditor: 'Neovim' },
        follows: [
          { id: '2', name: 'Bob' },
          { id: '3', name: 'Carol' },
        ],
      },
    });
    console.log(JSON.stringify(data, null, 2));
  } finally {
    await Promise.all([
      context.postgres.end(),
      context.mongoClient.close(),
      context.graph.close(),
    ]);
  }
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
