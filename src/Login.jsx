import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginData, setLoginData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/login.json');
        if (!res.ok) throw new Error('Failed to load login.json');
        const data = await res.json();
        setLoginData(data);
      } catch (err) {
        setFetchError(err.message || 'Error fetching login.json');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (loading || fetchError || !loginData) {
      alert('System initializing or error loading data.');
      return;
    }

    const u = username.trim().toLowerCase();
    const p = password.trim();

    if (!u || !p) {
      alert('Please enter both username and password.');
      return;
    }

    // 1. Check Employer List (Admins)
    const employerMatch = (loginData.employers || []).find(
      emp => emp.username.toLowerCase() === u && emp.password === p
    );

    if (employerMatch) {
      // Pass the username to the employer dashboard if needed
      const userToSave = { 
        name: employerMatch.username, 
        role: 'employer',
        ...employerMatch 
      };
      localStorage.setItem('currentUser', JSON.stringify(userToSave));
      navigate('/employer');
      return;
    }

    // 2. Check Employee List
    const employeeMatch = (loginData.employees || []).find(
      emp => emp.name.toLowerCase() === u && emp.password === p
    );

    if (employeeMatch) {
      const userToSave = { 
        role: 'employee', 
        ...employeeMatch // This includes .name, .id, etc.
      };
      localStorage.setItem('currentUser', JSON.stringify(userToSave));
      navigate('/app');
      return;
    }

    alert('Invalid username or password.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900">Sign In</h2>
          <p className="text-slate-500 mt-2">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Username</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your name or admin ID"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>

          <button 
            type="submit" 
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-indigo-200 transition-all transform active:scale-[0.98]"
          >
            Log In
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;