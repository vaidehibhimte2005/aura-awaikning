/**
 * Thin fetch-based API client.
 * - Access token is kept in memory only (never localStorage) to limit XSS impact.
 * - The refresh token lives in an httpOnly cookie set by the API.
 * - On a 401 the client refreshes once and retries the request.
 * - All responses follow { success, data, meta } / { success:false, message }.
 */
const BASE = `${import.meta.env.VITE_API_URL || ''}/api`;

let accessToken = null;
let refreshPromise = null;
let onSessionExpired = () => {};

export const tokenStore = {
  get: () => accessToken,
  set: (t) => {
    accessToken = t;
  },
  clear: () => {
    accessToken = null;
  },
};

export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
  /** { fieldName: message } for inline form errors */
  get fieldErrors() {
    return Object.fromEntries((this.errors || []).map((e) => [e.field, e.message]));
  }
}

function buildUrl(path, params) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }
  return url.toString();
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.success) throw new ApiError(body.message || 'Session expired', res.status);
        accessToken = body.data.accessToken;
        return body.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request(method, path, { body, params, retry = true, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      headers,
      credentials: 'include',
      signal,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Unable to reach the server. Please check your connection.', 0);
  }

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    try {
      await refreshAccessToken();
      return request(method, path, { body, params, retry: false, signal });
    } catch {
      accessToken = null;
      onSessionExpired();
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : { success: res.ok, data: await res.text() };
  if (!res.ok || payload.success === false) {
    throw new ApiError(payload.message || `Request failed (${res.status})`, res.status, payload.errors);
  }
  return payload; // { success, data, meta }
}

export const api = {
  get: (path, params, opts) => request('GET', path, { params, ...opts }),
  post: (path, body, opts) => request('POST', path, { body, ...opts }),
  put: (path, body, opts) => request('PUT', path, { body, ...opts }),
  patch: (path, body, opts) => request('PATCH', path, { body, ...opts }),
  delete: (path, opts) => request('DELETE', path, opts),
  upload: (file, folder = 'misc') => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', `/uploads?folder=${encodeURIComponent(folder)}`, { body: fd });
  },
  refresh: refreshAccessToken,
};
