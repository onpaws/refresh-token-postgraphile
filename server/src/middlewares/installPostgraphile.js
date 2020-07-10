import postgraphilePkg from 'postgraphile'
import PgSimplifyInflectorPlugin from "@graphile-contrib/pg-simplify-inflector";
import RefreshTokenPlugin from '../plugins/refreshTokenPlugin.js';
const { postgraphile, pluginHook } = postgraphilePkg;

const { ACCESS_TOKEN_SECRET, DATABASE_URL } = process.env

const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

/*
 * This function generates the options for a PostGraphile instance to use. We
 * make it a separate function call so that we may call it from other places
 * (such as tests) and even parameterise it if we want.
 */
export const postgraphileOptions = (overrides) => {
  return {
    // This is for PostGraphile server plugins: https://www.graphile.org/postgraphile/plugins/
    pluginHook,

    // This is so that PostGraphile installs the watch fixtures, it's also needed to enable live queries
    ownerConnectionString: DATABASE_URL,

    // dynamicJson: instead of inputting/outputting JSON as strings, input/output raw JSON objects
    dynamicJson: true,

    // ignoreRBAC=false: honour the permissions in your DB - don't expose what you don't GRANT
    ignoreRBAC: false,

    // ignoreIndexes=false: honour your DB indexes - only expose things that are fast
    ignoreIndexes: false,

    // setofFunctionsContainNulls=false: reduces the number of nulls in your schema
    setofFunctionsContainNulls: false,

    // Enable GraphiQL in development
    graphiql: isDev,
    // Use a fancier GraphiQL with `prettier` for formatting, and header editing.
    enhanceGraphiql: true,

    // See https://www.graphile.org/postgraphile/debugging/
    extendedErrors:
      isDev || isTest
        ? [
          "errcode",
          "severity",
          "detail",
          "hint",
          "positon",
          "internalPosition",
          "internalQuery",
          "where",
          "schema",
          "table",
          "column",
          "dataType",
          "constraint",
          "file",
          "line",
          "routine",
        ]
        : ["errcode"],
    showErrorStack: isDev,

    // Enable Postgres EXPLAIN. Check GraphiQL
    allowExplain: isDev,

    // Automatically update GraphQL schema when database changes
    watchPg: isDev,
    
    // Keep data/schema.graphql and data/schema.json up to date
    sortExport: true,
    // exportGqlSchemaPath: isDev
    //   ? `${__dirname}/../../data/schema.graphql`
    //   : null,
    // exportJsonSchemaPath: isDev ? `${__dirname}/../../data/schema.json` : null,

    /*
     * Plugins to enhance the GraphQL schema, see:
     *   https://www.graphile.org/postgraphile/extending/
     */
    appendPlugins: [
      RefreshTokenPlugin,
      PgSimplifyInflectorPlugin
    ],

    graphileBuildOptions: {
      /*
       * Any properties here are merged into the settings passed to each Graphile
       * Engine plugin - useful for configuring how the plugins operate.
       */

      /*
       * We install our own watch fixtures manually because we run PostGraphile
       * with non-database-owner privileges, so we don't need to be warned that
       * they were not installed
       */
      pgSkipInstallingWatchFixtures: true,
    },
    // security and auth
    pgDefaultRole: 'demo_anonymous',
    jwtSecret: ACCESS_TOKEN_SECRET,
    jwtPgTypeIdentifier: 'demo_public.jwt_token',

    /*
     * Postgres transaction settings for each GraphQL query/mutation to
     * indicate to Postgres who is attempting to access the resources. These
     * will be referenced by RLS policies/triggers/etc.
     *
     * Settings set here will be set using the equivalent of `SET LOCAL`, so
     * certain things are not allowed. You can override Postgres settings such
     * as 'role' and 'search_path' here; but for settings indicating the
     * current user, session id, or other privileges to be used by RLS policies
     * the setting names must contain at least one and at most two period
     * symbols (`.`), and the first segment must not clash with any Postgres or
     * extension settings. We find `jwt.claims.*` to be a safe namespace,
     * whether or not you're using JWTs.
     */
    // async pgSettings(req: IncomingMessage) {
    // const claims = await getUserClaimsFromRequest(req);
    // return {
    // Everyone uses the "visitor" role currently
    // role: process.env.DATABASE_VISITOR

    // If there are any claims, then add them into the session.
    // ...Object.entries(claims).reduce((memo, [key, value]) => {
    //   if (!key.match(/^[a-z][a-z0-9A-Z-_]+$/)) {
    //     throw new Error("Invalid claim key.");
    //   }

    /*
     * Note, though this says "jwt" it's not actually anything to do with
     * JWTs, we just know it's a safe namespace to use, and it means you
     * can use JWTs too, if you like, and they'll use the same settings
     * names reducing the amount of code you need to write.
     */
    // memo[`jwt.claims.${key}`] = value;
    // return memo;
    // }, {}),
    // };
    // },

    // When running in the server, we need to set websocketMiddlewares
    ...overrides,
  };
}

const postGraphileMiddleware = (app) => {
  const authPgPool = app.get("authPgPool");
  /*
   * If we're using subscriptions, they may want access to sessions/etc. Make
   * sure any websocketMiddlewares are installed before this point. Note that
   * socket middlewares must always call `next()`, otherwise you're going to
   * have some issues.
   */
  const websocketMiddlewares = app.get("websocketMiddlewares");

  // Install the PostGraphile middleware
  const middleware = postgraphile(
    authPgPool,
    'demo_public',
    postgraphileOptions({
      websocketMiddlewares,
      /*
       * These properties are merged into context (the third argument to GraphQL
       * resolvers). This is useful if you write your own plugins that need
       * access to, e.g., the logged in user.
       */
       additionalGraphQLContextFromRequest: async (_, res) => {
        // const claims = getUserClaimsFromRequest(req);
        const rootPgPool = app.get("rootPgPool");
        return {
          rootPgPool,
          res
          // claims,
          // Passport.js `login` function, converted to a Promise implementation
          // login: user => {
          //   if (!user) throw new Error("user argument is required");
          //   return new Promise((resolve, reject) => {
          //     req.login(user, err => {
          //       if (err) reject(new Error(err));
          //       resolve(user);
          //     });
          //   });
          // },
        };
      },
    })
  );
  app.use(middleware);
};

export default postGraphileMiddleware;