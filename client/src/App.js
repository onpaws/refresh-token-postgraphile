import React, { useState } from 'react'
import { AuthProvider } from './useAuth'
import Login from './Login'
import Todos from './Todos'
import CreateTodo from './CreateTodo'

const App = () => {
  const [showTodos, toggleTodos] = useState(false)

  return (
    <AuthProvider>
      <div>
        <h4>Login</h4>
        <Login />
        <hr />
        <h4>Todos</h4>
        <h6>(must be logged in to see)</h6>
        <button onClick={() => toggleTodos(!showTodos)}>toggle todos</button>
        {showTodos && <Todos />}
        <CreateTodo />
      </div>
    </AuthProvider>
  );
}

export default App;

