import { useCallback, useRef } from "react";
import { usePopout } from "../components/PopoutProvider";

type UnsavedChangesPromptOptions = {
  isDirtyRef: React.MutableRefObject<boolean>;
  onSave?: () => Promise<boolean>;
  onDiscard?: () => void;
};

export const useUnsavedChangesPrompt = ({
  isDirtyRef,
  onSave,
  onDiscard
}: UnsavedChangesPromptOptions) => {
  const { showPopout } = usePopout();
  const promptOpenRef = useRef(false);

  return useCallback(
    (proceed: () => void) => {
      if (!isDirtyRef.current) {
        proceed();
        return;
      }
      if (promptOpenRef.current) return;
      promptOpenRef.current = true;
      showPopout({
        title: "Unsaved changes",
        message: "You have unsaved changes. What would you like to do?",
        dismissOnBackdrop: false,
        actions: [
          {
            label: "Cancel",
            onClick: () => {
              promptOpenRef.current = false;
            }
          },
          {
            label: "Save",
            tone: "primary",
            onClick: () => {
              promptOpenRef.current = false;
              if (!onSave) return;
              void onSave().then((ok) => {
                if (ok) {
                  proceed();
                }
              });
            }
          },
          {
            label: "Discard",
            tone: "danger",
            onClick: () => {
              promptOpenRef.current = false;
              onDiscard?.();
              proceed();
            }
          }
        ]
      });
    },
    [isDirtyRef, onDiscard, onSave, showPopout]
  );
};
