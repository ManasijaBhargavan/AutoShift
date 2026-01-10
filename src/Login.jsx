import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [name, setName] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [employerPassword, setEmployerPassword] = useState('');
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

    if (loading) {
      alert('Still loading credentials, please wait.');
      return;
    }

    if (fetchError || !loginData) {
      alert('Unable to validate credentials: ' + (fetchError || 'no data'));
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmployer = employerPassword.trim();
    const trimmedEmployee = employeePassword.trim();

    // Employer flow: if employer password provided and no name
    if (trimmedEmployer !== '' && trimmedName === '') {
      if (loginData.employerPassword && trimmedEmployer === loginData.employerPassword) {
        navigate('/employer');
      } else {
        alert('Invalid employer password');
      }
      return;
    }

    // Employee flow: name required
    if (trimmedName === '') {
      alert('Enter employee name or employer password.');
      return;
    }

    const match = (loginData.employees || []).find(e => e.name && e.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (!match) {
      alert('Employee not found.');
      return;
    }

    // If employee entry has a non-empty password, require it. Otherwise allow.
    if (match.password && match.password !== '') {
      if (trimmedEmployee === match.password) {
        navigate('/app');
      } else {
        alert('Invalid employee password');
      }
    } else {
      // no password required for this employee
      navigate('/app');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-4">Welcome</h2>
        <p className="text-sm text-slate-500 mb-6">Employees: enter your name (password optional). Employers: enter employer password only.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Employee Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Employee Password (optional)</label>
            <input
              value={employeePassword}
              onChange={(e) => setEmployeePassword(e.target.value)}
              placeholder="Employee password"
              type="password"
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Employer Password (no username)</label>
            <input
              value={employerPassword}
              onChange={(e) => setEmployerPassword(e.target.value)}
              placeholder="Employer password"
              type="password"
              className="mt-1 block w-full rounded-md border px-3 py-2"
            />
          </div>

          <div className="flex items-center gap-3 justify-end">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md">Continue</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
