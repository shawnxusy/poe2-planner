import "./env.js"; // MUST be first: loads .env before transitive db import.

import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const host = "0.0.0.0";

const app = await buildApp();
app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
