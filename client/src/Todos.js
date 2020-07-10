import React from 'react';
import { useQuery, gql } from '@apollo/client';
const TODO_QUERY = gql`
query Todos {
  todos {
    edges {
      node {
        id
        todo
        completed
        person {
          firstName
          lastName
        }
      }
    }
  }
}
`;

const Todos = () => {
  const { loading, error, data } = useQuery(TODO_QUERY, {
    fetchPolicy: 'no-cache',
    errorPolicy: 'all',
  });
  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error.toString()}</div>;
  return (
    <div>
      <table>
        <thead>
          <tr>
            <td>Todo</td>
            <td>Person</td>
          </tr>
        </thead>
        <tbody>
          {data?.todos.edges.map(({ node: { id, todo, person: { firstName, lastName } } }) =>
            <tr key={id}>
              <td>{todo}</td>
              <td>{firstName} {lastName}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div >
  )
}

export default Todos