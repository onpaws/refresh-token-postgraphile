# `refresh_token` support for PostGraphile with silent refresh

## What is it?
Experimental `refresh_token` support for PostGraphile. Users get session-like UX including multiple tab support, but without the server having to maintain centralized session state (e.g. Redis/DB). We save nothing in local storage, and don't do a DB look up on every request.

## Why? PostGraphile supports JWTs already, what does this bring?
AFAICT PostGraphile currently supports 
  - _reading_ JWTs on incoming requests & setting up subsequent context/transactions in `pgClient`. Great! 💯
  - _issuing_ new JWTs using a Postgres function+type, and returning JWTs in the GraphQL API. Easy to consume from your GraphQL client and convenient - also great. 💯

## So...why then?
The reading story is already solid and this project doesn't set out to change that.

I'm trying to improve the story on _issuing_ with stronger browser security in mind. My goal is to keep the [documented](https://www.graphile.org/postgraphile/postgresql-schema-design/#authentication-and-authorization) usual auth flow that issues an `access_token` 'in band', but also introduce a side effect of _setting an 'out of band' `refresh_token` path'd cookie_ (aka 'silent refresh').

## How do I try it?
  - This works in tandem with [PostGraphile](https://www.graphile.org/postgraphile/requirements/), so you will need Node and Postgres. Install those first. Tested on macOS 10.15/Node 14; may work on older versions too but haven't tested.
  - Clone this repo `git clone git@github.com:onpaws/refresh-token-postgraphile`, install Node deps (whatever way you like e.g. `yarn`), and start up Postgres.
   - The database is called `demo`, so please run:
    
    $ createdb demo
    $ psql -d demo < db.sql
    $ cd server; yarn; yarn start
    (from another terminal)
    $ cd client; yarn; yarn start
    
  - *Heads up!* When starting the frontend, CRA will open http://localhost:3000 which we don't want (CORS).

    Please point your browser instead to http://localhost:4000 

## "Stateless sessions"
Because JWTs are stateless, you may be able to drop centralized session storage (Redis/DB). This project pushes the token state out strictly to live on the client only. #war-on-state

User lookups in the DB happen only in three situations now, not on every request, which would be not great. More on that below.

Real talk: unless you're running at Reddit scale these so-called 'stateless sessions' probably won't make a lick of difference to your scaling story. But yes, at least in principle, it's true your server should need less memory to serve the same # of users.

## Security
We try to improve the security situation by:
 - Carefully restricting the `refresh_token` to live 'out of band':
   - We never send the `refresh_token` via GraphQL
   - We additionally set the `HttpOnly` cookie flag so browser JavaScript will never see it (may help mitigate XSS)
 - We never persist any tokens to local storage
 - Where possible it's suggested to consider the other cookie flags (e.g. `SameSite`, `Secure`)
 - Not strictly 'security' but important: multiple tab support. Opening new tabs works in the expected way
 - Using a separate secret for the `refresh_token`. (Possibly overkill. Would be curious your opinion on this)

## Who is this not for?
 - If your target client platform doesn't support cookies (looking at you, native mobile devs) you won't benefit from the cookie aspects. If you're still after `refresh_tokens`/silent refresh feel free to copypasta the relevant bits as you see best.
 - If you rely on sessions, which I understand many Passport.js users do. Deliberately left that out of scope, at least for now.

## I want more technical info
 - This project comprises three pieces: 
   - PostGraphile [plugin](server/src/plugins/refreshTokenPlugin.js)
   - Express [middleware](server/src/middlewares/installCookieJWT.js) providing the `/access_token` endpoint
   - React [hook](client/src/useAuth.js)

 - Because the `access_token` is deliberately short-lived, we introduce [apollo-link-token-refresh](https://www.npmjs.com/package/apollo-link-token-refresh) for silent refresh. Since this is GraphQL, when the link detects token expiry it fills a blocking operation queue in the background and smoothly handles the token refresh + queue release in with no UX impact.
  - JWT issuance requires a user lookup, which hits the DB. This happens in three cases:
    - when the user logs on (obviously)
    - when the `access_token` expires (defaults to 15m, [configurable](server/src/plugins/refreshTokenPlugin.js#70). uses `refresh_token`)
    - when the page refreshes (i.e. when React inits. uses `refresh_token`)
  - We don't hit the DB/Redis on every request like with traditional sessions
 - The FE is careful to avoid using local storage, but refreshing the page still feels like a session because `useAuth` fetches a new `access_token` when the FE presents a valid `refresh_token` thanks to the cookie.
 - The `refresh_token` cookie is deliberately path-scoped so browser doesn't send the token on every request, which would defeat the point of trying to restrict it's presence on the wire.

## Where does this come from?
I previously stood up an Apollo Server-based project doing the same thing and wanted to port it to PostGraphile. As I understand it the `access_token`/`refresh_token` [concept](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) may have been inspired by OAuth2.

In the end we shift the session from living on a centralized store on the server into two tokens living strictly in the end user's browser. The tradeoff is more requests to the `/access_token` endpoint, in return for giving up the requirement to manage a centralized session store. Whether this tradeoff is worth it is up to you.

### Token type comparison
| access_token | refresh_token |
|-------------------------------------------------------------------|------------------------------------------------------------------|
| ephemeral (e.g. 15 min) | persisted (e.g. 7 days) |
| delivered in the usual way via GQL | set as a _path'd_ cookie, never accessible by browser JavaScript |
| lives in browser/JS memory only, never persisted to local storage | never accessible to browser/JS, also never persisted to local storage, lives as an 'out of band' cookie |
| refreshing the page means FE has to fetch a new access_token | offers `HttpOnly`, `Secure`, `SameSite`                          |
| if compromised, short lifetime may help reduce blast radius | path'd cookie means it's only sent when that path is requested   |

Where possible using strict CSP/HTTP security headers should bring additional risk mitigation.

So there you have it, `refresh_token` based auth for PostGraphile!

## Antifeatures
 - I've deliberately not included Passport.js support, at least for now.
 - We don't persist anything to local storage.
 - If you use GraphiQL, the default 15min expiry might be too aggressive for a 'typical' GraphiQL sessions. In this case consider incorporating the `isDev` flag or otherwise setting up a different mutation for local dev.
 - Zero styling effort. It's ugly on purpose and I won't be accepting your styling PR :)

## Status
 - No tests, use at your own risk.

## I want to revoke a token
 - The story is a bit different from sessions on this. There is no session table to reach for because JWTs are stateless.
   - That is one reason why we use the lower 15 minute `access_token` lifetime. 
 - If you want to revoke a user's token, ensure `generate_token_plaintext()` doesn't return a token for that user, and wait 15 minutes. That's it. (Deleting the user would do the trick, as could setting up some kind of eg. `active` flag if you wanted to keep the record.)
 - In an emergency you could in theory rotate the JWT secret(s), just be aware this would impact all users.<a href="#note1" id="note1ref"><sup>1</sup></a>

## I'm getting errors
This project uses `http-proxy` to put everything into a single origin to punt on tedious CORS config.
*Make sure you're pulling up the FE via http://localhost:4000.*

## Useful operations to copypasta
```graphql
mutation RegisterPerson {
  registerPerson(input: {firstName: "Liam", lastName: "Gleesome", email: "liam@example.com", password: "liam@example.com"}) {
    person {
      id
    }
  }
}

mutation Authenticate {
  authenticate(input: { email: "liam@example.com", password: "liam@example.com" })
}
# Tip: to subsequently run authenticated queries in GraphiQL, remember to paste token output into the field that pops up when you hit the 'Header' button. Remember it will expire in 15 minutes by default.

mutation CreateTodo {
  createTodo(input: {todo: {todo: "Todo 1"}}) {
    todo {
      nodeId
    }
  }
}

query Todos {
  todos {
    edges {
      node {
        id
        nodeId
        todo
        person {
          firstName
        }
      }
    }
  }
}
```

<a id="note1" href="#note1ref"><sup>1</sup></a> Unlike with sessions, if a JWT gets compromised server operators have restricted options -- JWTs can be considered 'non-revocable'. Well, kind of - technically you could 'revoke' all JWTs by rotating the signing secret, but this kills everyone's token, not just the compromised one.

[More JWT background](https://auth0.com/blog/stateless-auth-for-stateful-minds/)