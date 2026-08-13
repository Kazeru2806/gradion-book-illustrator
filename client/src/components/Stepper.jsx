const STEPS = ['Style', 'Characters', 'Portraits', 'Chapters', 'Illustrations'];

const STATUS_TO_INDEX = {
  CREATED: -1,
  STYLE_SET: 0,
  CHARACTERS_GENERATED: 1,
  PORTRAITS_GENERATED: 2,
  CHAPTERS_GENERATED: 3,
  DONE: 4,
};

/**
 * @param {{ status: string, step_state: string }} project
 */
export default function Stepper({ project }) {
  const completedUpTo = STATUS_TO_INDEX[project.status] ?? -1;
  const isRunning = project.step_state === 'running';
  const isFailed = project.step_state === 'failed';

  // Which step index is currently active (running/failed)?
  // The "active" step is the next one after completed.
  const activeIndex = completedUpTo + 1;

  return (
    <div className="stepper" role="list" aria-label="Pipeline steps">
      {STEPS.map((label, i) => {
        const isDone = i <= completedUpTo;
        const isActive = i === activeIndex && (isRunning || isFailed || project.status !== 'DONE');
        const isCurrent = i === activeIndex;
        const failed = isCurrent && isFailed;
        const running = isCurrent && isRunning;

        let stepClass = 'stepper-step';
        if (isDone) stepClass += ' stepper-step--done';
        else if (failed) stepClass += ' stepper-step--failed';
        else if (isActive) stepClass += ' stepper-step--active';

        return (
          <div key={label} className={stepClass} role="listitem">
            <div className="stepper-step__connector">
              {i > 0 && <div className="stepper-step__line" />}
              <div className="stepper-step__circle" aria-label={`Step ${i + 1}: ${label} — ${isDone ? 'done' : running ? 'running' : failed ? 'failed' : 'pending'}`}>
                {isDone ? '✓' : running ? <span className="spinner spinner--sm" style={{ borderTopColor: '#3b82f6' }} /> : failed ? '✕' : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className="stepper-step__line" />}
            </div>
            <div className="stepper-step__label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
