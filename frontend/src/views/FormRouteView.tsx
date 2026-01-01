import FormView from "../components/FormView";

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

type FormRouteViewProps = {
  token: string;
  entityKey: string;
  config: ViewConfig;
  recordId: string | "new";
  currentUserId: string;
  currentUserLabel: string;
  currentUserRole: "ADMIN" | "USER";
  contextWorldId?: string;
  contextWorldLabel?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  entityTypeIdParam?: string;
  locationTypeIdParam?: string;
  selectedEntityType?: EntityTypeSummary;
  lastEntitiesListRoute?: string | null;
  navigateWithGuard: (nextHash: string) => void;
  onContextSwitch: (next: { worldId: string; worldLabel?: string }) => void;
};

export default function FormRouteView({
  token,
  entityKey,
  config,
  recordId,
  currentUserId,
  currentUserLabel,
  currentUserRole,
  contextWorldId,
  contextWorldLabel,
  contextCampaignId,
  contextCharacterId,
  entityTypeIdParam,
  locationTypeIdParam,
  selectedEntityType,
  lastEntitiesListRoute,
  navigateWithGuard,
  onContextSwitch
}: FormRouteViewProps) {
  const initialValues =
    recordId === "new"
      ? entityKey === "campaigns"
        ? contextWorldId
          ? { worldId: contextWorldId }
          : undefined
        : entityKey === "characters"
          ? contextWorldId
            ? { worldId: contextWorldId }
            : undefined
          : entityKey === "entities"
            ? contextWorldId || entityTypeIdParam
              ? {
                  ...(contextWorldId ? { worldId: contextWorldId } : {}),
                  ...(entityTypeIdParam ? { entityTypeId: entityTypeIdParam } : {})
                }
              : undefined
            : entityKey === "locations"
              ? contextWorldId || locationTypeIdParam
                ? {
                    ...(contextWorldId ? { worldId: contextWorldId } : {}),
                    ...(locationTypeIdParam ? { locationTypeId: locationTypeIdParam } : {})
                  }
                : undefined
              : entityKey === "entity_types"
                ? contextWorldId
                  ? { worldId: contextWorldId }
                  : undefined
                : entityKey === "relationship_types"
                  ? contextWorldId
                    ? { worldId: contextWorldId }
                    : undefined
                  : entityKey === "location_types"
                    ? contextWorldId
                      ? { worldId: contextWorldId }
                      : undefined
                  : undefined
      : undefined;
  const initialLabels =
    recordId === "new"
      ? {
          ...(contextWorldLabel ? { worldId: contextWorldLabel } : {}),
          ...(selectedEntityType?.name ? { entityTypeId: selectedEntityType.name } : {})
        }
      : undefined;

  return (
    <section className="app__panel app__panel--wide">
      <FormView
        token={token}
        viewKey={config.formKey}
        recordId={recordId}
        onBack={() => {
          if (entityKey === "entities") {
            navigateWithGuard(lastEntitiesListRoute ?? "/list/entities");
            return;
          }
          const listPath = `/list/${entityKey}`;
          navigateWithGuard(listPath);
        }}
        currentUserId={currentUserId}
        currentUserLabel={currentUserLabel}
        currentUserRole={currentUserRole}
        initialValues={initialValues}
        initialLabels={initialLabels}
        contextWorldId={contextWorldId}
        contextWorldLabel={contextWorldLabel}
        contextCampaignId={contextCampaignId}
        contextCharacterId={contextCharacterId}
        onContextSwitch={onContextSwitch}
      />
    </section>
  );
}
