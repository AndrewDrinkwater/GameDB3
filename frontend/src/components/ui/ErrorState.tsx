type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
};

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert">
      <span>{message ?? "Something went wrong."}</span>
      {onRetry ? (
        <button type="button" className="ghost-button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
