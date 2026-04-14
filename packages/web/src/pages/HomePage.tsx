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
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const job = await api.createJob({ url, maxDepth, maxPages });
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      if (err instanceof SignupRequiredError) setShowAuth(true);
      else setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setLoading(false);
    }
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
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="mb-12 pt-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs font-medium text-zinc-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
            AI-Ready
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Generate <span className="gradient-text">llms.txt</span>
            <br />
            for any website
          </h1>
          <p className="mt-4 text-lg text-zinc-400">
            Crawl any site and produce a structured{' '}
            <a
              href="https://llmstxt.org"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 transition-colors hover:text-blue-300"
            >
              llms.txt
            </a>{' '}
            file in seconds.
          </p>
        </div>

        <div className="card-dark gradient-border rounded-2xl p-8">
          <form onSubmit={handleSubmit}>
            <label className="mb-2 block text-sm font-medium text-zinc-300">Website URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="input-dark !py-4 !text-base"
            />

            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className="mt-4 flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showOptions ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced options
            </button>

            {showOptions && (
              <div className="mt-3 grid animate-slide-up grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">Max depth</label>
                  <input
                    type="number"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(+e.target.value)}
                    min={1}
                    max={10}
                    className="input-dark"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">Max pages</label>
                  <input
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(+e.target.value)}
                    min={1}
                    max={10000}
                    className="input-dark"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary mt-6 w-full !py-3.5 !text-base">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Generate llms.txt'
              )}
            </button>
          </form>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-6 text-center">
          {[
            { icon: '~', label: 'Server-rendered', desc: 'Cheerio for fast HTML crawling' },
            { icon: '>', label: 'SPA Support', desc: 'Playwright for client-side apps' },
            { icon: '#', label: 'Structured', desc: 'llmstxt.org spec compliant' },
          ].map((f) => (
            <div key={f.label} className="group">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 font-mono text-lg text-blue-400 transition-colors group-hover:border-indigo-500/30">
                {f.icon}
              </div>
              <p className="text-sm font-medium text-zinc-200">{f.label}</p>
              <p className="mt-1 text-xs text-zinc-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onAuth={handleAuth} />
    </Layout>
  );
}
