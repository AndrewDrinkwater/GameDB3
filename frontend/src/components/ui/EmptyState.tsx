type EmptyStateProps = {
  message?: string;
  onRetry?: () => void;
};

export default function EmptyState({ message, onRetry }: EmptyStateProps) {
  return (
    <div role="status" aria-live="polite">
      <span>{message ?? "Nothing to show."}</span>
      {onRetry ? (
        <button type="button" className="ghost-button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
