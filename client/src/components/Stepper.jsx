const STEPS = ['Style', 'Characters', 'Portraits', 'Chapters', 'Illustrations'];
const STATUS_TO_INDEX = {
  CREATED: -1, STYLE_SET: 0, CHARACTERS_GENERATED: 1,
  PORTRAITS_GENERATED: 2, CHAPTERS_GENERATED: 3, DONE: 4,
};

export default function Stepper({ project }) {
  const completedUpTo = STATUS_TO_INDEX[project.status] ?? -1;
  const isRunning = project.step_state === 'running';
  const isFailed  = project.step_state === 'failed';
  const activeIndex = completedUpTo + 1;

  return (
    <div className="stepper" role="list" aria-label="Pipeline steps">
      {STEPS.map((label, i) => {
        const done = i <= completedUpTo;
        const isCurrent = i === activeIndex && project.status !== 'DONE';
        const failed = isCurrent && isFailed;
        const running = isCurrent && isRunning;

        let cls = 'step';
        if (done) cls += ' done';
        else if (isCurrent) cls += ' current';
        else cls += ' pending';

        let sq;
        if (done) {
          sq = <span className="gd-num-square done" aria-label={`${label} complete`}>✓</span>;
        } else if (running) {
          sq = <span className="gd-num-square current"><span className="spinner sm" style={{ borderTopColor: '#FF6B00' }} /></span>;
        } else if (failed) {
          sq = <span className="gd-num-square" style={{ background: '#3A160A' }}>!</span>;
        } else {
          sq = <span className={`gd-num-square ${isCurrent ? '' : 'gray'}`}>{i + 1}</span>;
        }

        return (
          <span key={label} role="listitem" style={{ display: 'contents' }}>
            <div className={cls}>
              {sq}
              <span className="lbl">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`connector${done ? ' done' : ''}`} />
            )}
          </span>
        );
      })}
    </div>
  );
}
