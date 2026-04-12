import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../api.js';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="text-lg font-bold text-slate-900">llms.txt Generator</Link>
          <div className="flex items-center gap-4 text-sm">
            {!loading && (
              user ? (
                <>
                  <Link to="/dashboard" className="text-slate-600 hover:text-slate-900">Dashboard</Link>
                  <span className="text-slate-400 text-xs hidden sm:inline">{user.email}</span>
                  <button onClick={handleLogout} className="text-slate-600 hover:text-slate-900">Sign out</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-slate-600 hover:text-slate-900">Sign in</Link>
                  <Link to="/login?mode=signup" className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">Sign up</Link>
                </>
              )
            )}
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
