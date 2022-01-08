import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, Observable } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { TokenRefreshLink } from 'apollo-link-token-refresh';
import jwtDecode from 'jwt-decode';
import { getAccessToken, setAccessToken } from './accessToken';

const requestLink = new ApolloLink(
  (operation, forward) =>
    new Observable(observer => {
      let handle;
      Promise.resolve(operation).then(operation => {
        const accessToken = getAccessToken();
        if (accessToken) {
          operation.setContext({
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });
        }
      })
      .then(() => {
        handle = forward && forward(operation).subscribe({
          next: observer.next.bind(observer),
          error: observer.error.bind(observer),
          complete: observer.complete.bind(observer)
        });
      })
      .catch(observer.error.bind(observer));

      return () => {
        if (handle) handle.unsubscribe();
      };
    })
);

const httpLink = new HttpLink({
  uri: '/graphql',
  credentials: 'include'
});

const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
  if (graphQLErrors) {
    for (let err of graphQLErrors) {
        console.error(
          '[GraphQL error]: Message:', err.message, 'Location(s):', err.locations, 'Path:', err.path
        )
      }
    }
  if (networkError)  {
    console.warn('[Network error]:', networkError, 'Operation:', operation.operationName);
  }
});

const tokenLink = new TokenRefreshLink({
  isTokenValidOrUndefined: () => {
    const token = getAccessToken();

    if (!token) {
      return true;
    }

    try {
      const { exp } = jwtDecode(token);
      if (Date.now() >= exp * 1000) {
        return false;
      } else {
        return true;
      }
    } catch (err) {
      return false;
    }
  },
  fetchAccessToken: () => fetch("/access_token", {
    method: "POST",
    credentials: "include"
  }),
  handleFetch: (access_token) => {
    setAccessToken(access_token);
  },
  handleError: (err) => {
    console.warn("Your refresh token is invalid. Please try re-logging in.");
    console.error(err);
  },
});

const cache = new InMemoryCache();

const client = new ApolloClient({
  link: ApolloLink.from([
    tokenLink,
    errorLink,
    requestLink,
    httpLink,
  ]),
  cache
});

export default client;