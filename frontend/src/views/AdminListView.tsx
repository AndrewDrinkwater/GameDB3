import ListView from "../components/ListView";

type ViewConfig = {
  listKey: string;
  formKey: string;
  label: string;
};

type AdminListViewProps = {
  token: string;
  adminKey: string;
  config: ViewConfig;
  currentUserRole: "ADMIN" | "USER";
  navigateWithGuard: (nextHash: string) => void;
  handleSidebarSelect: () => void;
};

export default function AdminListView({
  token,
  adminKey,
  config,
  currentUserRole,
  navigateWithGuard,
  handleSidebarSelect
}: AdminListViewProps) {
  return (
    <section className="app__panel app__panel--wide">
      <ListView
        token={token}
        viewKey={config.listKey}
        formViewKey={config.formKey}
        currentUserRole={currentUserRole}
        onOpenForm={(id) => {
          navigateWithGuard(`/admin/${adminKey}/${id}`);
          handleSidebarSelect();
        }}
      />
    </section>
  );
}
