import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, SignupRequiredError } from '../api.js';
import { useAuth } from '../context/AuthContext.js';
import AuthModal from '../components/AuthModal.js';
import Layout from '../components/Layout.js';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxPages, setMaxPages] = useState(200);
  const [showOptions, setShowOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const job = await api.createJob({ url, maxDepth, maxPages }); navigate(`/jobs/${job.id}`); }
    catch (err) {
      if (err instanceof SignupRequiredError) setShowAuth(true);
      else setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally { setLoading(false); }
  };

  const handleAuth = async (email: string, password: string, mode: 'signup' | 'login') => {
    const user = mode === 'signup' ? await api.signup(email, password) : await api.login(email, password);
    setUser({ id: user.id, email: user.email });
    setShowAuth(false);
    const job = await api.createJob({ url, maxDepth, maxPages });
    navigate(`/jobs/${job.id}`);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <span className="mb-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">AI-Ready</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">llms.txt Generator</h1>
          <p className="mt-2 text-slate-500">Crawl any website and generate a structured <a href="https://llmstxt.org" target="_blank" rel="noopener" className="text-indigo-600 hover:underline">llms.txt</a> file instantly.</p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Website URL</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" required
            className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          <button type="button" onClick={() => setShowOptions(!showOptions)} className="mt-3 text-xs font-semibold text-slate-400 hover:text-slate-600">
            {showOptions ? 'Hide' : 'Advanced'} options
          </button>
          {showOptions && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-semibold text-slate-600">Max depth</label>
                <input type="number" value={maxDepth} onChange={(e) => setMaxDepth(+e.target.value)} min={1} max={10} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-semibold text-slate-600">Max pages</label>
                <input type="number" value={maxPages} onChange={(e) => setMaxPages(+e.target.value)} min={1} max={10000} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {loading ? 'Creating...' : 'Generate llms.txt'}
          </button>
        </form>
      </div>
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onAuth={handleAuth} />
    </Layout>
  );
}
