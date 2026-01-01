import type { ReactNode } from "react";

type LoadingStateProps = {
  message?: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export default function LoadingState({ message, children }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      {children ?? <span>{message ?? "Loading..."}</span>}
    </div>
  );
}
