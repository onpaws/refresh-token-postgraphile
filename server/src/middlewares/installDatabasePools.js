import pgPkg from 'pg'
const { Pool } = pgPkg;

const databasePoolMiddleware = (app) => {
  // This pool runs as the database owner, so it can do anything.
  const rootPgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  app.set("rootPgPool", rootPgPool);

  // This pool runs as the unprivileged user, it's what PostGraphile uses.
  const authPgPool = new Pool({
    connectionString: process.env.AUTH_DATABASE_URL,
  });
  app.set("authPgPool", authPgPool);
};

export default databasePoolMiddleware