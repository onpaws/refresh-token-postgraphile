import React, { useState } from 'react';
import { useMutation, gql } from '@apollo/client';
const CREATE_TODO_MUTATION = gql`
mutation CreateTodo($todo: String!) {
  createTodo(input: {todo: {todo: $todo}}) {
    todo {
      id
    }
  }
}
`;

const Todos = () => {
  const [todo, setTodo] = useState('')
  const [createTodo, { loading, error }] = useMutation(CREATE_TODO_MUTATION,
    {
      variables: { todo },
      onError: (e) => { console.error(e) }
    }
  );

  return (
    <div>
      <input onChange={(e) => setTodo(e.target.value)} />
      <button onClick={() => {
        createTodo();
        setTodo('');
      }} disabled={loading}>
        New Todo
      </button>
      {error && error.toString()}
    </div>
  )
}

export default Todos