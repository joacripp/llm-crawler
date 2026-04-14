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
    <div className="min-h-screen bg-zinc-950">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.04),transparent_60%)] pointer-events-none" />
      <nav className="relative border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight">
            <span className="gradient-text">llms.txt</span>
            <span className="ml-1 font-medium text-zinc-400">Generator</span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            {!loading &&
              (user ? (
                <>
                  <Link to="/dashboard" className="text-zinc-400 transition-colors hover:text-zinc-100">
                    Dashboard
                  </Link>
                  <span className="hidden text-xs text-zinc-600 sm:inline">{user.email}</span>
                  <button onClick={handleLogout} className="text-zinc-500 transition-colors hover:text-zinc-300">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-zinc-400 transition-colors hover:text-zinc-100">
                    Sign in
                  </Link>
                  <Link to="/login?mode=signup" className="btn-primary !px-3 !py-1.5 !text-xs">
                    Sign up
                  </Link>
                </>
              ))}
          </div>
        </div>
      </nav>
      <main className="relative mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
