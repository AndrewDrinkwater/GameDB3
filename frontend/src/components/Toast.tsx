import { useEffect } from "react";

type ToastProps = {
  message: string | null;
  onDismiss?: () => void;
  durationMs?: number;
};

export default function Toast({ message, onDismiss, durationMs = 2000 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => {
      onDismiss?.();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
