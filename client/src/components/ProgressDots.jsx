/**
 * @param {{ completedCount: number, totalCount: number, step_state: string }} props
 */
export default function ProgressDots({ completedCount, totalCount, step_state }) {
  return (
    <div className="progress-dots" aria-label={`${completedCount} of ${totalCount} steps complete`}>
      {Array.from({ length: totalCount }, (_, i) => {
        let cls = 'progress-dot';
        if (i < completedCount) cls += ' progress-dot--done';
        else if (i === completedCount && step_state === 'running') cls += ' progress-dot--active';
        else cls += ' progress-dot--pending';
        return <span key={i} className={cls} />;
      })}
    </div>
  );
}
