import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type PopoutTone = "primary" | "danger" | "ghost";

type PopoutAction = {
  label: string;
  tone?: PopoutTone;
  onClick?: () => void;
  closeOnClick?: boolean;
};

type PopoutOptions = {
  title: string;
  message: ReactNode;
  actions: PopoutAction[];
  dismissOnBackdrop?: boolean;
};

type PopoutEntry = {
  id: string;
  options: PopoutOptions;
};

type PopoutContextValue = {
  showPopout: (options: PopoutOptions) => string;
  closePopout: (id: string) => void;
};

const PopoutContext = createContext<PopoutContextValue | null>(null);

const createPopoutId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const usePopout = () => {
  const context = useContext(PopoutContext);
  if (!context) {
    throw new Error("usePopout must be used within PopoutProvider.");
  }
  return context;
};

export default function PopoutProvider({ children }: { children: ReactNode }) {
  const [popouts, setPopouts] = useState<PopoutEntry[]>([]);

  const closePopout = useCallback((id: string) => {
    setPopouts((current) => current.filter((popout) => popout.id !== id));
  }, []);

  const showPopout = useCallback((options: PopoutOptions) => {
    const id = createPopoutId();
    setPopouts((current) => [...current, { id, options }]);
    return id;
  }, []);

  const value = useMemo(() => ({ showPopout, closePopout }), [showPopout, closePopout]);
  const activePopout = popouts[popouts.length - 1];

  return (
    <PopoutContext.Provider value={value}>
      {children}
      {activePopout ? (
        <div
          className="popout-overlay"
          role="presentation"
          onClick={() => {
            if (activePopout.options.dismissOnBackdrop === false) return;
            closePopout(activePopout.id);
          }}
        >
          <div
            className="popout"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`popout-title-${activePopout.id}`}
            aria-describedby={`popout-message-${activePopout.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="popout__title" id={`popout-title-${activePopout.id}`}>
              {activePopout.options.title}
            </h2>
            <div className="popout__message" id={`popout-message-${activePopout.id}`}>
              {activePopout.options.message}
            </div>
            <div className="popout__actions">
              {activePopout.options.actions.map((action) => {
                const tone = action.tone ?? "ghost";
                const className =
                  tone === "primary"
                    ? "primary-button"
                    : tone === "danger"
                      ? "danger-button"
                      : "ghost-button";
                return (
                  <button
                    key={action.label}
                    type="button"
                    className={className}
                    onClick={() => {
                      action.onClick?.();
                      if (action.closeOnClick === false) return;
                      closePopout(activePopout.id);
                    }}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </PopoutContext.Provider>
  );
}
