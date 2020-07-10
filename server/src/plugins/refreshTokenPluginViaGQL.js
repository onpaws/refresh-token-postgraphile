import graphilePkg from 'graphile-utils'
const { makeExtendSchemaPlugin, gql } = graphilePkg;

/* 
  This was an initial attempt to setup `refresh_token`s by calling a resolver from another resolver.
  Upon further consideration, however, I'm not satisfied with the risk inherent with returning a refresh_token in JS.
  Because I'd rather keep that impossible, vs just inconvenient, I abandoned this approach in favor of the SQL one.

  See the bottom of this file for the corresponding Postgres function definition.
*/

const RefreshTokenPlugin = makeExtendSchemaPlugin((build) => ({
  typeDefs: gql`
    extend type Mutation {
      authenticate(input: AuthenticateCookieInput!): String
    }
  `,
  resolvers: {
    Mutation: {
      authenticate: async (_, args, context, resolveInfo) => {
        const { email, password } = args.input;
        const { graphql: { graphql } } = build
        try {
          const document = `
            mutation AuthenticateCookie($email: String!, $password: String!) {
              authenticateCookie(input: { email: $email, password: $password }) {
                jwtTokens
              }
            }
          `;
          const operationName = 'AuthenticateCookie';
          const variables = { email, password };
          const { data } = await graphql(
            resolveInfo.schema,
            document,
            null,
            context,
            variables,
            operationName
          );
          const accessToken = data?.authenticateCookie?.jwtTokens[0]
          const refreshToken = data?.authenticateCookie?.jwtTokens[1]

          context.res.cookie('qid', refreshToken, {
            httpOnly: true,
            sameSite: true,
            path: "/access_token"
          })

          return accessToken;
        } catch (e) {
          console.error(e);
          throw e;
        }
      }
    }
  }
})
);

export default RefreshTokenPlugin

/* 
 * Postgres function to issue two JWTs

CREATE OR REPLACE FUNCTION demo_public.authenticate_cookie(
  email TEXT,
  password TEXT
) RETURNS SETOF demo_public.jwt_token AS $$
DECLARE
  account demo_private.person_account;
  tokens demo_public.jwt_token[];
BEGIN
  SELECT a.* INTO account
  FROM demo_private.person_account as a
  WHERE a.email = $1;

  IF account.password_hash = crypt(password, account.password_hash) THEN
    tokens[0] = ('demo_authenticated', account.person_id, extract(epoch from (now() + interval '15 mins')))::demo_public.jwt_token;
    tokens[1] = ('demo_authenticated', account.person_id, extract(epoch from (now() + interval '7 days')))::demo_public.jwt_token;

    FOR i IN 0..array_upper(tokens, 1) LOOP
        RETURN NEXT tokens[i];
    END LOOP;
  ELSE
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql STRICT SECURITY DEFINER;
COMMENT ON FUNCTION demo_public.authenticate_cookie IS 'Modified version of authenticate() as seen in the docs';
-- TODO: is there a way to suppress this from the public GQL API but still call it from a resolver?

*/