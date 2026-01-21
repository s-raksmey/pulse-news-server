import { createServer } from "http";
import { createYoga } from "graphql-yoga";
import { schema } from "./graphql/schema.js";
import { createAuthContext } from "./middleware/auth.js";

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/graphql",
  context: async ({ request }) => {
    // Create authentication context for each request
    return await createAuthContext(request);
  },
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Allow admin and web apps
    credentials: true,
  },
});

createServer(yoga).listen(4000, () => {
  console.log("Pulse News GraphQL API running at http://localhost:4000/graphql");
  console.log("🔐 JWT Authentication middleware enabled");
  console.log("🌐 CORS enabled for localhost:3000 and localhost:3001");
});
