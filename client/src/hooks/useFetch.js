import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

/**
 * Loads `path` with `params`; re-fetches when either changes.
 * Returns { data, meta, loading, error, reload, setData }.
 * Pass `path = null` to skip fetching.
 */
export function useFetch(path, params, { keepPrevious = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: !!path, error: null });
  const key = path ? `${path}?${JSON.stringify(params || {})}` : null;
  const ctrl = useRef();

  const load = useCallback(() => {
    if (!key) return;
    ctrl.current?.abort();
    const controller = new AbortController();
    ctrl.current = controller;
    setState((s) => ({ ...s, loading: true, error: null, data: keepPrevious ? s.data : null }));
    api
      .get(path, params, { signal: controller.signal })
      .then((res) => setState({ data: res.data, meta: res.meta || null, loading: false, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState((s) => ({ ...s, loading: false, error: err }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: load, setData };
}

export function useDebounce(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
