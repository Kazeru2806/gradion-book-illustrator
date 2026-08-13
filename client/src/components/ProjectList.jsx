import { useState, useRef } from 'react';
import { api } from '../api.js';
import ProgressDots from './ProgressDots.jsx';

function statusPill(project) {
  if (project.progress?.isDone) return { label: 'Done', cls: 'ink' };
  if (project.step_state === 'failed') return { label: 'Error', cls: 'gray' };
  if (project.step_state === 'running') return { label: null, dot: true }; // orange pill with dot
  if (project.status === 'CREATED') return { label: 'Draft', cls: 'gray' };
  return { label: null, dot: true };
}

function projectSubtitle(project) {
  const STATUS_STEPS = { CREATED: 0, STYLE_SET: 1, CHARACTERS_GENERATED: 2, PORTRAITS_GENERATED: 3, CHAPTERS_GENERATED: 4, DONE: 5 };
  const LABELS = ['Style', 'Characters', 'Portraits', 'Chapters', 'Illustrations'];
  const idx = STATUS_STEPS[project.status] ?? 0;
  if (project.status === 'CREATED') return 'Book text saved · style not yet generated';
  if (project.status === 'DONE') return 'All 5 steps complete';
  return LABELS.slice(0, idx).join(' + ') + ' done';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── New Project Form ──────────────────────────────────────────────────────────

function NewProjectForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [bookText, setBookText] = useState('');
  const [bookFile, setBookFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBookFile(file);
    const reader = new FileReader();
    reader.onload = ev => setBookText(ev.target.result);
    reader.readAsText(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !bookText.trim()) {
      setError('Give the project a title and provide the book text (paste or upload).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.createProject(title.trim(), bookText);
      onCreated(data.project);
    } catch (err) {
      setError(err.message || 'Failed to create project.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border-2)', borderRadius: 'var(--r-3)', padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Start a new illustration project</h3>
        <button className="gd-btn gd-btn-ghost gd-btn-sm" onClick={onCancel} type="button">Cancel</button>
      </div>
      <p className="meta" style={{ marginBottom: 16 }}>Give it a title, then paste the book's text or upload a .txt file.</p>

      <form onSubmit={handleSubmit}>
        <div className="gd-field">
          <label htmlFor="f-title">Project title <span className="req">*</span></label>
          <input id="f-title" placeholder="e.g. The Wind in the Willows — cottage-core" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="gd-field" style={{ marginTop: 16 }}>
          <label htmlFor="book-textarea">Book text <span className="req">*</span></label>
          <div
            className={`dropzone${bookFile ? ' has-file' : ''}`}
            onClick={() => fileRef.current?.click()}
            role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
            aria-label="Upload book file"
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--grad-ink)' }}>
              {bookFile ? `✓ ${bookFile.name} loaded` : 'Click to choose a .txt file'}
            </div>
            <div className="hint">Plain text only · used once as context for every step below</div>
          </div>
          <input ref={fileRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }} onChange={handleFile} />
          <div className="divider-or">or paste text</div>
          <textarea
            id="book-textarea"
            rows={5}
            placeholder="Once upon a time, in a small burrow by the river…"
            value={bookText}
            onChange={e => setBookText(e.target.value)}
          />
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--grad-orange-deep)', marginTop: 8, marginBottom: 0 }}>{error}</p>}

        <button id="btn-create-project" type="submit" className="gd-btn gd-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }} disabled={loading}>
          {loading ? <><span className="spinner sm" />Creating…</> : <>Create project <span className="gd-arrow">→</span></>}
        </button>
      </form>
    </div>
  );
}

// ── Project List ──────────────────────────────────────────────────────────────

export default function ProjectList({ user, projects, onSelectProject, onProjectCreated, onSignOut }) {
  const [showForm, setShowForm] = useState(false);
  const initials = (user.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  function handleCreated(project) {
    setShowForm(false);
    onProjectCreated(project);
    onSelectProject(project.id);
  }

  return (
    <>
      <nav className="gd-nav">
        <div className="gd-nav-inner">
          <div className="gd-nav-logo" onClick={() => {}} aria-label="Gradion Book Illustrator">📖 Gradion</div>
          <div className="gd-nav-links">
            <a onClick={() => setShowForm(false)}>Projects</a>
          </div>
          <div className="gd-nav-user">
            <div className="gd-nav-avatar">{initials}</div>
            {user.name}
            <button id="btn-signout" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </nav>

      <div className="app-body">
        {showForm && <NewProjectForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />}

        {!showForm && (
          <>
            <div className="list-head">
              <h2>Your projects</h2>
              <button id="btn-new-project" className="gd-btn gd-btn-primary" onClick={() => setShowForm(true)}>
                + New project
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="empty-state">
                <p style={{ margin: 0 }}>No projects yet.</p>
                <button className="gd-btn gd-btn-primary" onClick={() => setShowForm(true)}>+ New project</button>
              </div>
            ) : (
              <div className="project-list">
                {projects.map((project, i) => {
                  const { label, cls, dot } = statusPill(project);
                  return (
                    <div
                      key={project.id}
                      className="project-row"
                      style={{ '--stagger': `${i * 45}ms` }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open project: ${project.title}`}
                      onClick={() => onSelectProject(project.id)}
                      onKeyDown={e => e.key === 'Enter' && onSelectProject(project.id)}
                    >
                      <div className="title">
                        <h4>{project.title}</h4>
                        <span className="meta">
                          Created {formatDate(project.created_at)} · {projectSubtitle(project)}
                        </span>
                      </div>
                      <ProgressDots
                        completedCount={project.progress?.completedCount ?? 0}
                        totalCount={5}
                        step_state={project.step_state}
                      />
                      {dot ? (
                        <span className="gd-pill"><span className="dot" />In progress</span>
                      ) : (
                        <span className={`gd-pill ${cls ?? ''}`}>{label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
