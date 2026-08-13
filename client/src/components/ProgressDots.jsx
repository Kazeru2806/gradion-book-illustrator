export default function ProgressDots({ completedCount, totalCount, step_state }) {
  return (
    <div className="progress-mini" aria-label={`${completedCount} of ${totalCount} steps complete`}>
      {Array.from({ length: totalCount }, (_, i) => (
        <span key={i} className={`seg${i < completedCount ? ' on' : ''}`} />
      ))}
    </div>
  );
}
