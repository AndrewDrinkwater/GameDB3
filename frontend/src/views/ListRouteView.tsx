import ListView from "../components/ListView";

type ViewConfig = {
  listKey: string;
  formKey: string;
  label: string;
};

type EntityTypeSummary = {
  id: string;
  name: string;
  count: number;
};

type ListRouteViewProps = {
  token: string;
  listKey: string;
  config: ViewConfig;
  contextWorldId?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  entityTypeIdParam?: string;
  locationTypeIdParam?: string;
  selectedEntityType?: EntityTypeSummary;
  currentUserRole: "ADMIN" | "USER";
  navigateWithGuard: (nextHash: string) => void;
  handleSidebarSelect: () => void;
};

export default function ListRouteView({
  token,
  listKey,
  config,
  contextWorldId,
  contextCampaignId,
  contextCharacterId,
  entityTypeIdParam,
  locationTypeIdParam,
  selectedEntityType,
  currentUserRole,
  navigateWithGuard,
  handleSidebarSelect
}: ListRouteViewProps) {
  const extraParams =
    listKey === "entities" && entityTypeIdParam
      ? { entityTypeId: entityTypeIdParam }
      : listKey === "locations" && locationTypeIdParam
        ? { locationTypeId: locationTypeIdParam }
        : undefined;
  const titleOverride =
    listKey === "entities" && selectedEntityType ? selectedEntityType.name : undefined;
  const subtitleOverride =
    listKey === "entities" && selectedEntityType ? "Entities" : undefined;

  return (
    <section className="app__panel app__panel--wide">
      <ListView
        token={token}
        viewKey={config.listKey}
        formViewKey={config.formKey}
        contextWorldId={contextWorldId}
        contextCampaignId={contextCampaignId}
        contextCharacterId={contextCharacterId}
        extraParams={extraParams}
        titleOverride={titleOverride}
        subtitleOverride={subtitleOverride}
        currentUserRole={currentUserRole}
        onOpenForm={(id) => {
          if (listKey === "entities" && id === "new" && entityTypeIdParam) {
            navigateWithGuard(`/form/entities/new?entityTypeId=${entityTypeIdParam}`);
          } else if (listKey === "locations" && id === "new" && locationTypeIdParam) {
            navigateWithGuard(`/form/locations/new?locationTypeId=${locationTypeIdParam}`);
          } else {
            navigateWithGuard(`/form/${listKey}/${id}`);
          }
          handleSidebarSelect();
        }}
      />
    </section>
  );
}
