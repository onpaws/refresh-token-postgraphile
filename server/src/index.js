import './dotenv.js'
import express from 'express'
import { createServer } from 'http'
import installCookieJWT from './middlewares/installCookieJWT.js'
import installDatabasePools from './middlewares/installDatabasePools.js'
import installPostgraphile from './middlewares/installPostgraphile.js'
import installFrontendProxy from './middlewares/installFrontendProxy.js'

const main = async () => {
  const app = express();
  const httpServer = createServer();
  app.set('httpServer', httpServer);

  await installDatabasePools(app);
  await installPostgraphile(app);
  await installCookieJWT(app);
  await installFrontendProxy(app);

  app.listen(4000, () => {
    console.log(`🚀 GraphQL endpoint ready at http://localhost:4000/graphql`);
    console.log(`🚀 UI ready at http://localhost:4000/graphiql`);
    console.log(`If you haven't already, please run the React FE from refresh-token-postraphile/fe/, which will make...`);
    console.log(`🚀 React FE ready at http://localhost:4000/`);
});
}

main()
.catch(e => {
  console.error("Fatal error occurred starting server");
  console.error(e);
  process.exit(101);
})