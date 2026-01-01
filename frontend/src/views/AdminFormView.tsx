import FormView from "../components/FormView";

type ViewConfig = {
  listKey: string;
  formKey: string;
  label: string;
};

type AdminFormViewProps = {
  token: string;
  adminKey: string;
  config: ViewConfig;
  recordId: string;
  currentUserId: string;
  currentUserLabel: string;
  currentUserRole: "ADMIN" | "USER";
  contextWorldLabel?: string;
  navigateWithGuard: (nextHash: string) => void;
  onContextSwitch: (next: { worldId: string; worldLabel?: string }) => void;
};

export default function AdminFormView({
  token,
  adminKey,
  config,
  recordId,
  currentUserId,
  currentUserLabel,
  currentUserRole,
  contextWorldLabel,
  navigateWithGuard,
  onContextSwitch
}: AdminFormViewProps) {
  return (
    <section className="app__panel app__panel--wide">
      <FormView
        token={token}
        viewKey={config.formKey}
        recordId={recordId}
        onBack={() => {
          navigateWithGuard(`/admin/${adminKey}`);
        }}
        currentUserId={currentUserId}
        currentUserLabel={currentUserLabel}
        currentUserRole={currentUserRole}
        contextWorldLabel={contextWorldLabel}
        onContextSwitch={onContextSwitch}
      />
    </section>
  );
}
