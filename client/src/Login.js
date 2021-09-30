import React, { useState } from 'react';
import { useMutation, gql } from '@apollo/client';
import { setAccessToken } from './accessToken';
const LOGIN_MUTATION = gql`
mutation Authenticate($email: String!, $password: String!) {
  authenticate(input: { email: $email, password: $password })
}
`;

const Login = () => {
  const [email, setEmail] = useState('bob@bob.com');
  const [password, setPassword] = useState('bob@bob.com');
  const [note, setNote] = useState('');
  const [login, { loading: mutationLoading, error: mutationError }] = useMutation(LOGIN_MUTATION, {
    fetchPolicy: 'no-cache',
    errorPolicy: 'all',
    onError: (err) => { console.log(err) },
  });
  
  return (
    <div>
      <form onSubmit={async (e)=>{
        e.preventDefault()
        const response = await login({
          variables: { email, password }
        });
        const { data: { authenticate: jwtToken } } = response;
        
        if (jwtToken) {
          setAccessToken(jwtToken);
          setEmail('');
          setPassword('');
          setNote('it worked')
        }
      }}>
      
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <br />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <br />
      <button type="submit" disabled={mutationLoading}>login</button>
      {mutationError && <p>Error. Please try again</p>}
      <span>{note}{note && <button onClick={() => setNote('')}>x</button>}</span>
      </form>
    </div>
  )
}

export default Login