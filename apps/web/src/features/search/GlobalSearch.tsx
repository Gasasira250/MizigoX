import type { GlobalSearchPayload } from '@mizigox/shared';
import { canSearch } from '@mizigox/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';

export function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const enabled = canSearch(user?.permissions);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GlobalSearchPayload | null>(null);
  const boxId = useId();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => {
      void apiGet<GlobalSearchPayload>(`/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults({ query, results: [] }));
    }, 250);
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, [enabled, query]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="relative min-w-0 flex-1 md:max-w-md">
      <label className="sr-only" htmlFor={boxId}>
        Search
      </label>
      <input
        id={boxId}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
        placeholder="Search shipments, customers, routes…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results?.results[0]) {
            navigate(results.results[0].href);
            setOpen(false);
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && query.trim().length >= 2 ? (
        <div className="absolute z-40 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          {results?.results.length ? (
            <ul className="max-h-80 overflow-auto py-1">
              {results.results.map((hit) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <Link
                    className="block px-3 py-2 text-sm hover:bg-slate-50"
                    to={hit.href}
                    onClick={() => setOpen(false)}
                  >
                    <span className="font-medium text-[#12355b]">{hit.title}</span>
                    <span className="mt-0.5 block text-xs uppercase tracking-wide text-slate-400">
                      {hit.type}
                    </span>
                    {hit.subtitle ? (
                      <span className="block text-xs text-slate-500">{hit.subtitle}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">No authorized matches.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
