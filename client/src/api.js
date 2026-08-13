const BASE = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  restoreSession: () => request('GET', '/auth/me'),
  signIn: (email, name) => request('POST', '/auth', { email, name }),
  signOut: () => request('POST', '/auth/signout'),

  listProjects: () => request('GET', '/projects'),
  getProject: (id) => request('GET', `/projects/${id}`),
  getBookText: (id) => request('GET', `/projects/${id}/book_text`),
  createProject: (title, bookText, bookFile) => {
    if (bookFile) {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('book_file', bookFile);
      return request('POST', '/projects', fd);
    }
    return request('POST', '/projects', { title, book_text: bookText });
  },
  deleteProject: (id) => request('DELETE', `/projects/${id}`),

  runStep: (projectId, stepKey, opts = {}) =>
    request('POST', `/projects/${projectId}/steps/${stepKey}/run`, opts),
  retryStep: (projectId, stepKey) =>
    request('POST', `/projects/${projectId}/steps/${stepKey}/retry`),

  imageUrl: (projectId, filePath) => {
    if (!filePath) return null;
    const filename = filePath.split('/').pop();
    return `${BASE}/images/${projectId}/${filename}`;
  },
};
