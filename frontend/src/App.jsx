import { useState } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);

  function handleLogout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  if (!user) {
    return <Login onAuth={setUser} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}