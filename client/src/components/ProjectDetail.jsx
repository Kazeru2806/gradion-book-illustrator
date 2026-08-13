import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api.js';
import Stepper from './Stepper.jsx';

// ── Helpers ────────────────────────────────────────────────────────────────

const STEP_SEQUENCE = ['style', 'characters', 'portraits', 'chapters', 'illustrations'];
const STEP_LABELS = {
  style: 'Style',
  characters: 'Characters',
  portraits: 'Portraits',
  chapters: 'Chapters',
  illustrations: 'Illustrations',
};
const STATUS_TO_CURRENT_STEP = {
  CREATED: 'style',
  STYLE_SET: 'characters',
  CHARACTERS_GENERATED: 'portraits',
  PORTRAITS_GENERATED: 'chapters',
  CHAPTERS_GENERATED: 'illustrations',
  DONE: null,
};

function currentStep(project) {
  if (project.step_state === 'failed') {
    return STATUS_TO_CURRENT_STEP[project.status] ?? null;
  }
  return STATUS_TO_CURRENT_STEP[project.status] ?? null;
}

// ── Book Text Modal ────────────────────────────────────────────────────────

function BookModal({ text, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Book Text</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal__body">
          <pre>{text}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Character Card ─────────────────────────────────────────────────────────

function CharacterCard({ character, projectId }) {
  const imgUrl = api.imageUrl(projectId, character.portrait_path);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {imgUrl && !imgError ? (
        <img
          className="portrait-img"
          src={imgUrl}
          alt={`Portrait of ${character.name}`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="portrait-placeholder">
          {character.portrait_path ? '🖼️ Loading…' : '⏳ Pending'}
        </div>
      )}
      <div>
        <h4>{character.name}</h4>
        <p className="text-sm mt-1" style={{ lineHeight: '1.5' }}>{character.prompt}</p>
      </div>
    </div>
  );
}

// ── Chapter Card ───────────────────────────────────────────────────────────

function ChapterCard({ chapter, projectId }) {
  const imgUrl = api.imageUrl(projectId, chapter.illustration_path);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {imgUrl && !imgError ? (
        <img
          className="illustration-img"
          src={imgUrl}
          alt={`Illustration for ${chapter.name}`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="illustration-placeholder">
          {chapter.illustration_path ? '🖼️ Loading…' : '⏳ Pending'}
        </div>
      )}
      <div>
        <h4>{chapter.name}</h4>
        <p className="text-sm mt-1" style={{ lineHeight: '1.5' }}>{chapter.prompt}</p>
        {chapter.character_names?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.625rem' }}>
            {chapter.character_names.map(n => (
              <span key={n} className="pill pill--draft" style={{ fontSize: '0.7rem' }}>{n}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step Action Panel ──────────────────────────────────────────────────────

function StepActionPanel({ project, onRun, onRetry }) {
  const step = currentStep(project);
  const [styleInput, setStyleInput] = useState('');
  const [busy, setBusy] = useState(false);

  if (!step || project.status === 'DONE') return null;

  const isRunning = project.step_state === 'running';
  const isFailed  = project.step_state === 'failed';
  const isStuck   = project.stuck;

  async function handleRun() {
    setBusy(true);
    try {
      await onRun(step, step === 'style' ? { style: styleInput } : {});
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    setBusy(true);
    try {
      await onRetry(step);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Error banner */}
      {isFailed && project.error_message && (
        <div className="error-banner">
          <p>
            <strong>Step failed:</strong>{' '}
            {project.error_message.split('\n')[0]}
          </p>
          <button
            id={`btn-retry-${step}`}
            className="btn btn--danger btn--sm"
            onClick={handleRetry}
            disabled={busy}
          >
            {busy ? <><span className="spinner spinner--sm" />Retrying…</> : `↻ Retry ${STEP_LABELS[step]}`}
          </button>
        </div>
      )}

      {/* Stuck banner */}
      {isStuck && !isFailed && (
        <div className="stuck-banner">
          <p>
            ⚠️ The <strong>{STEP_LABELS[step]}</strong> step appears stuck (running for over 5 minutes).
          </p>
          <button
            id={`btn-force-retry-${step}`}
            className="btn btn--ghost btn--sm"
            onClick={handleRetry}
            disabled={busy}
          >
            {busy ? <><span className="spinner spinner--sm" />Retrying…</> : '↻ Force Retry'}
          </button>
        </div>
      )}

      {/* Running indicator */}
      {isRunning && !isStuck && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.875rem 1rem',
          background: 'var(--blue-dim)',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span className="spinner" style={{ borderTopColor: 'var(--blue)' }} />
          <span style={{ color: 'var(--blue)', fontSize: '0.9rem' }}>
            Running <strong>{STEP_LABELS[step]}</strong>… this may take a minute
          </span>
        </div>
      )}

      {/* Run button (idle) */}
      {!isRunning && !isFailed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {step === 'style' && (
            <div className="field">
              <label htmlFor="style-input">Custom style <span className="text-muted">(optional — leave blank to auto-generate)</span></label>
              <input
                id="style-input"
                className="input"
                placeholder="e.g. Bright Pixar-style 3D render with vivid colors…"
                value={styleInput}
                onChange={e => setStyleInput(e.target.value)}
              />
            </div>
          )}
          <button
            id={`btn-run-${step}`}
            className="btn btn--primary"
            onClick={handleRun}
            disabled={busy}
            style={{ alignSelf: 'flex-start' }}
          >
            {busy
              ? <><span className="spinner spinner--sm" />Starting…</>
              : `▶ Run ${STEP_LABELS[step]}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Project Detail ─────────────────────────────────────────────────────────

export default function ProjectDetail({ projectId, onBack }) {
  const [project, setProject] = useState(null);
  const [bookText, setBookText] = useState(null);
  const [showBook, setShowBook] = useState(false);
  const [loadError, setLoadError] = useState('');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getProject(projectId);
      setProject(data.project);
      return data.project;
    } catch (err) {
      setLoadError(err.message);
      return null;
    }
  }, [projectId]);

  // Poll while running
  useEffect(() => {
    load();

    function startPoll() {
      stopPoll();
      pollRef.current = setInterval(async () => {
        const p = await load();
        if (!p || p.step_state !== 'running') stopPoll();
      }, 3000);
    }

    function stopPoll() {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }

    // Check after first load whether we need to poll
    load().then(p => {
      if (p?.step_state === 'running') startPoll();
    });

    return stopPoll;
  }, [load]);

  // Fetch book text lazily when modal opens
  async function handleShowBook() {
    if (!bookText) {
      try {
        const data = await api.getBookText(projectId);
        setBookText(data.book_text ?? '(no text)');
      } catch {
        setBookText('(Could not load book text)');
      }
    }
    setShowBook(true);
  }

  async function handleRun(stepKey, opts) {
    await api.runStep(projectId, stepKey, opts);
    const p = await load();
    // Start polling if step is now running
    if (p?.step_state === 'running') {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const fresh = await load();
        if (!fresh || fresh.step_state !== 'running') {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 3000);
    }
  }

  async function handleRetry(stepKey) {
    await api.retryStep(projectId, stepKey);
    const p = await load();
    if (p?.step_state === 'running') {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const fresh = await load();
        if (!fresh || fresh.step_state !== 'running') {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 3000);
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <button className="back-link" onClick={onBack}>← Back</button>
        <div className="error-banner"><p>{loadError}</p></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '4rem' }}>
        <span className="spinner spinner--lg" />
        <p className="text-muted">Loading project…</p>
      </div>
    );
  }

  const isDone = project.status === 'DONE';

  return (
    <>
      <nav className="topnav">
        <button className="back-link" onClick={onBack} style={{ margin: 0 }}>← Projects</button>
        <button className="btn btn--ghost btn--sm" onClick={handleShowBook} id="btn-view-book">
          📄 View Book
        </button>
      </nav>

      {showBook && <BookModal text={bookText ?? '…'} onClose={() => setShowBook(false)} />}

      <div className="page">
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.625rem' }}>{project.title}</h1>
            {isDone && <span className="pill pill--done">✓ Done</span>}
          </div>
          <p className="text-muted text-sm">
            Project ID: <code>{project.id}</code>
          </p>
        </div>

        {/* Stepper */}
        <Stepper project={project} />

        {/* Action Panel */}
        <StepActionPanel
          project={project}
          onRun={handleRun}
          onRetry={handleRetry}
        />

        {/* Style */}
        {project.style && (
          <>
            <div className="divider" />
            <section>
              <h2 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>🎨 Illustration Style</h2>
              <div className="card card--glass">
                <p style={{ color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: '1.7' }}>
                  "{project.style}"
                </p>
              </div>
            </section>
          </>
        )}

        {/* Characters */}
        {project.characters?.length > 0 && (
          <>
            <div className="divider" />
            <section>
              <h2 style={{ marginBottom: '1rem', fontSize: '1rem' }}>
                👥 Characters <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.875rem' }}>({project.characters.length})</span>
              </h2>
              <div className="grid-2">
                {project.characters.map(c => (
                  <CharacterCard key={c.id} character={c} projectId={project.id} />
                ))}
              </div>
            </section>
          </>
        )}

        {/* Chapters */}
        {project.chapters?.length > 0 && (
          <>
            <div className="divider" />
            <section>
              <h2 style={{ marginBottom: '1rem', fontSize: '1rem' }}>
                📖 Chapters <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.875rem' }}>({project.chapters.length})</span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {project.chapters.map(ch => (
                  <ChapterCard key={ch.id} chapter={ch} projectId={project.id} />
                ))}
              </div>
            </section>
          </>
        )}

        {isDone && (
          <>
            <div className="divider" />
            <div style={{
              textAlign: 'center', padding: '2rem',
              background: 'var(--green-dim)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 'var(--radius-lg)',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</div>
              <h3 style={{ color: 'var(--green)', marginBottom: '0.375rem' }}>All done!</h3>
              <p className="text-muted">Your illustrated book is complete.</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
