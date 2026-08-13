import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api.js';
import Stepper from './Stepper.jsx';

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
  return STATUS_TO_CURRENT_STEP[project.status] ?? null;
}

function BookModal({ text, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h4>Book Text</h4>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{text}</div>
      </div>
    </div>
  );
}

function EntityCard({ title, prompt, imageUrl, aspect = 'portrait', pendingLabel, tags = [] }) {
  const [imgError, setImgError] = useState(false);
  const artClass = aspect === 'chapter' ? 'art chapter' : 'art';

  return (
    <div className="entity-card">
      <div className={`${artClass}${!imageUrl || imgError ? ' pending' : ''}`}>
        {imageUrl && !imgError ? (
          <img src={imageUrl} alt={title} onError={() => setImgError(true)} />
        ) : (
          <span className={`placeholder-label${imageUrl ? '' : ' muted'}`}>
            {imageUrl ? 'Loading…' : pendingLabel}
          </span>
        )}
      </div>
      <div className="body">
        <h5>{title}</h5>
        <p>{prompt}</p>
        {tags.length > 0 && (
          <div className="char-tags">
            {tags.map((tag) => (
              <span key={tag} className="char-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepActionPanel({ project, onRun, onRetry }) {
  const step = currentStep(project);
  const [styleInput, setStyleInput] = useState('');
  const [busy, setBusy] = useState(false);

  if (!step || project.status === 'DONE') return null;

  const isRunning = project.step_state === 'running';
  const isFailed = project.step_state === 'failed';
  const isStuck = project.stuck;
  const portraitCount = project.characters?.length ?? 0;
  const portraitsReady = project.characters?.filter((c) => c.portrait_path).length ?? 0;
  const showPortraitProgress = step === 'portraits' && isRunning && portraitCount > 0;

  async function handleRun() {
    setBusy(true);
    try {
      await onRun(step, step === 'style' && styleInput.trim() ? { style: styleInput.trim() } : {});
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
    <div className="step-panel">
      {isFailed && project.error_message && (
        <div className="error-panel" style={{ marginBottom: 16 }}>
          <p style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>
            <strong>{STEP_LABELS[step]} failed:</strong> {project.error_message}
          </p>
          <button
            id={`btn-retry-${step}`}
            type="button"
            className="gd-btn gd-btn-secondary gd-btn-sm"
            onClick={handleRetry}
            disabled={busy}
          >
            {busy ? <>Retrying…</> : `↻ Retry ${STEP_LABELS[step]}`}
          </button>
        </div>
      )}

      {isStuck && !isFailed && (
        <div className="stuck-panel" style={{ marginBottom: 16 }}>
          <p>
            The <strong>{STEP_LABELS[step]}</strong> step appears stuck (running for over 5 minutes).
          </p>
          <button
            id={`btn-force-retry-${step}`}
            type="button"
            className="gd-btn gd-btn-ghost gd-btn-sm"
            onClick={handleRetry}
            disabled={busy}
          >
            {busy ? <>Retrying…</> : '↻ Force Retry'}
          </button>
        </div>
      )}

      {isRunning && !isStuck && (
        <div className="status-line">
          <span className="spinner sm" />
          {showPortraitProgress ? (
            <>
              Generating portraits — <strong>{portraitsReady} of {portraitCount}</strong> ready…
            </>
          ) : (
            <>
              Running <strong>{STEP_LABELS[step]}</strong>… this may take a minute
            </>
          )}
        </div>
      )}

      {!isRunning && !isFailed && (
        <>
          {step === 'style' && (
            <div className="gd-field style-input-wrap">
              <label htmlFor="style-input">
                Custom style <span className="meta">(optional — leave blank to auto-generate)</span>
              </label>
              <input
                id="style-input"
                placeholder="e.g. Warm watercolor storybook with soft pencil outlines…"
                value={styleInput}
                onChange={(e) => setStyleInput(e.target.value)}
              />
            </div>
          )}
          <button
            id={`btn-run-${step}`}
            type="button"
            className="gd-btn gd-btn-primary"
            onClick={handleRun}
            disabled={busy}
          >
            {busy ? <>Starting…</> : <>▶ Run {STEP_LABELS[step]}</>}
          </button>
          <p className="help" style={{ marginTop: 12 }}>
            Each step calls Gemini once (portraits: up to 2 image calls). Image steps can take 30–90 seconds and require image-model quota — see README if you hit 429.
          </p>
        </>
      )}
    </div>
  );
}

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
      setLoadError('');
      return data.project;
    } catch (err) {
      const message =
        err.message === 'Failed to fetch'
          ? 'Could not reach the server. Make sure the API is running (./start.sh) and you are using http://localhost:5173.'
          : err.message;
      setLoadError(message);
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (project?.step_state !== 'running') return undefined;

    pollRef.current = setInterval(() => {
      load();
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [project?.step_state, load]);

  async function applyStepResponse(data) {
    if (data?.project) {
      setProject(data.project);
    } else {
      await load();
    }
  }

  async function handleRun(stepKey, opts) {
    try {
      const data = await api.runStep(projectId, stepKey, opts);
      await applyStepResponse(data);
    } catch (err) {
      if (err.data?.project) {
        setProject(err.data.project);
      } else {
        await load();
      }
    }
  }

  async function handleRetry(stepKey) {
    try {
      const data = await api.retryStep(projectId, stepKey);
      await applyStepResponse(data);
    } catch (err) {
      if (err.data?.project) {
        setProject(err.data.project);
      } else {
        await load();
      }
    }
  }

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

  if (loadError) {
    return (
      <div className="app-body">
        <button type="button" className="back-link" onClick={onBack}>← Projects</button>
        <div className="error-panel"><p>{loadError}</p></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="page-loading">
        <span className="spinner lg" />
        Loading project…
      </div>
    );
  }

  const step = currentStep(project);

  return (
    <>
      <nav className="gd-nav">
        <div className="gd-nav-inner">
          <button type="button" className="back-link" onClick={onBack} style={{ margin: 0 }}>← Projects</button>
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" className="gd-btn gd-btn-ghost gd-btn-sm" onClick={handleShowBook} id="btn-view-book">
              View book text
            </button>
          </div>
        </div>
      </nav>

      {showBook && <BookModal text={bookText ?? '…'} onClose={() => setShowBook(false)} />}

      <div className="app-body">
        <div className="panel-title">
          <div>
            <h2 style={{ marginBottom: 4 }}>{project.title}</h2>
            <p className="meta">Created {new Date(project.created_at).toLocaleDateString()}</p>
          </div>
          {project.status === 'DONE' && <span className="gd-pill ink">Done</span>}
        </div>

        <Stepper project={project} />

        <div className="detail-grid">
          <div>
            {(project.characters?.length > 0 || project.chapters?.length > 0) && (
              <>
                {project.characters?.length > 0 && (
                  <section style={{ marginBottom: 32 }}>
                    <h3 style={{ fontSize: 16, marginBottom: 16 }}>Characters</h3>
                    <div className="entity-grid">
                      {project.characters.map((character) => {
                        const portraitsRunning =
                          project.step_state === 'running' &&
                          project.status === 'CHARACTERS_GENERATED';
                        const pendingLabel = portraitsRunning && !character.portrait_path
                          ? 'Generating portrait…'
                          : 'Portrait pending';

                        return (
                        <EntityCard
                          key={character.id}
                          title={character.name}
                          prompt={character.prompt}
                          imageUrl={api.imageUrl(project.id, character.portrait_path)}
                          pendingLabel={pendingLabel}
                        />
                        );
                      })}
                    </div>
                  </section>
                )}

                {project.chapters?.length > 0 && (
                  <section>
                    <h3 style={{ fontSize: 16, marginBottom: 16 }}>Chapters</h3>
                    <div className="entity-grid">
                      {project.chapters.map((chapter) => (
                        <EntityCard
                          key={chapter.id}
                          title={chapter.name}
                          prompt={chapter.prompt}
                          imageUrl={api.imageUrl(project.id, chapter.illustration_path)}
                          aspect="chapter"
                          pendingLabel="Illustration pending"
                          tags={chapter.character_names ?? []}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {project.status === 'DONE' && (
              <div className="side-note" style={{ marginTop: 24, textAlign: 'center' }}>
                <h5>Complete</h5>
                <p>All five pipeline steps finished successfully.</p>
              </div>
            )}
          </div>

          <div>
            <StepActionPanel project={project} onRun={handleRun} onRetry={handleRetry} />

            {project.style && (
              <div className="side-note" style={{ marginTop: 16 }}>
                <h5>Illustration style</h5>
                <p style={{ fontStyle: 'italic' }}>"{project.style}"</p>
              </div>
            )}

            {step && project.step_state === 'idle' && project.status !== 'DONE' && (
              <div className="side-note" style={{ marginTop: 16 }}>
                <h5>Next step</h5>
                <p>Run <strong>{STEP_LABELS[step]}</strong> when you're ready.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
