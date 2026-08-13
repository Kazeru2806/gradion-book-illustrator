import { useState, useRef } from 'react';
import { api } from '../api.js';
import ProgressDots from './ProgressDots.jsx';

function statusPill(project) {
  if (project.progress?.isDone) return { label: 'Done', cls: 'pill--done' };
  if (project.step_state === 'failed') return { label: 'Failed', cls: 'pill--failed' };
  if (project.step_state === 'running') return { label: 'In Progress', cls: 'pill--progress' };
  if (project.status === 'CREATED') return { label: 'Draft', cls: 'pill--draft' };
  return { label: 'In Progress', cls: 'pill--progress' };
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── New Project Form ──────────────────────────────────────────────────────────

function NewProjectForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('paste'); // 'paste' | 'file'
  const [bookText, setBookText] = useState('');
  const [bookFile, setBookFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) { setBookFile(file); setMode('file'); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    if (mode === 'paste' && !bookText.trim()) { setError('Book text is required.'); return; }
    if (mode === 'file' && !bookFile) { setError('Please select a .txt file.'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.createProject(
        title.trim(),
        mode === 'paste' ? bookText : '',
        mode === 'file' ? bookFile : null
      );
      onCreated(data.project);
    } catch (err) {
      setError(err.message || 'Failed to create project.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: '2rem', border: '1px solid rgba(245,158,11,0.25)' }}>
      <h3 style={{ marginBottom: '1.25rem' }}>New Project</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <div className="field">
          <label htmlFor="np-title">Project title</label>
          <input
            id="np-title"
            className="input"
            placeholder="My Illustrated Story"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label>Book text</label>
          <div className="tab-group" style={{ marginBottom: '0.5rem' }}>
            <button type="button" className={`tab${mode === 'paste' ? ' tab--active' : ''}`} onClick={() => setMode('paste')}>Paste text</button>
            <button type="button" className={`tab${mode === 'file' ? ' tab--active' : ''}`} onClick={() => setMode('file')}>Upload .txt</button>
          </div>

          {mode === 'paste' ? (
            <textarea
              id="np-text"
              className="textarea"
              placeholder="Paste your book text here…"
              value={bookText}
              onChange={e => setBookText(e.target.value)}
              style={{ minHeight: '140px' }}
            />
          ) : (
            <div
              className={`dropzone${dragging ? ' dropzone--active' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload book file"
              onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
            >
              {bookFile
                ? <><span style={{ fontSize: '1.25rem' }}>📄</span> {bookFile.name}</>
                : <><span style={{ fontSize: '1.25rem' }}>⬆️</span> Drop a .txt file or click to browse</>}
              <input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                style={{ display: 'none' }}
                onChange={e => setBookFile(e.target.files[0] ?? null)}
              />
            </div>
          )}
        </div>

        {error && <div className="error-banner"><p>{error}</p></div>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button id="btn-create-project" type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? <><span className="spinner spinner--sm" />Creating…</> : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Project List ──────────────────────────────────────────────────────────────

export default function ProjectList({ user, projects, onSelectProject, onProjectCreated, onSignOut }) {
  const [showForm, setShowForm] = useState(false);

  function handleCreated(project) {
    setShowForm(false);
    onProjectCreated(project);
    onSelectProject(project.id);
  }

  const pill = (p) => statusPill(p);

  return (
    <>
      <nav className="topnav">
        <div className="topnav__brand">📖 Book Illustrator</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="topnav__user">
            {user.name} <span style={{ opacity: 0.5 }}>·</span> {user.email}
          </span>
          <button id="btn-signout" className="btn btn--ghost btn--sm" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>

      <div className="page">
        <div className="section-header">
          <div>
            <h1 style={{ fontSize: '1.5rem' }}>Your Projects</h1>
            <p className="text-muted mt-1">{projects.length === 0 ? 'No projects yet' : `${projects.length} project${projects.length > 1 ? 's' : ''}`}</p>
          </div>
          {!showForm && (
            <button id="btn-new-project" className="btn btn--primary" onClick={() => setShowForm(true)}>
              + New Project
            </button>
          )}
        </div>

        {showForm && (
          <NewProjectForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
        )}

        {projects.length === 0 && !showForm ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>No projects yet</h3>
            <p style={{ marginBottom: '1.5rem' }}>Create your first illustrated book to get started.</p>
            <button className="btn btn--primary" onClick={() => setShowForm(true)}>+ New Project</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {projects.map(project => {
              const { label, cls } = pill(project);
              return (
                <div
                  key={project.id}
                  className="card card--hover"
                  onClick={() => onSelectProject(project.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open project: ${project.title}`}
                  onKeyDown={e => e.key === 'Enter' && onSelectProject(project.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                      <h3 className="truncate" style={{ fontSize: '1rem' }}>{project.title}</h3>
                      <span className={`pill ${cls}`}>{label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span className="text-muted">{formatDate(project.created_at)}</span>
                      <ProgressDots
                        completedCount={project.progress?.completedCount ?? 0}
                        totalCount={project.progress?.totalCount ?? 5}
                        step_state={project.step_state}
                      />
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
