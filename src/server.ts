import { createServer } from "http";
import { createYoga } from "graphql-yoga";
import { schema } from "./graphql/schema.js";

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
});

createServer(yoga).listen(4000, () => {
  console.log("Pulse News GraphQL API running at http://localhost:4000/graphql");
});
