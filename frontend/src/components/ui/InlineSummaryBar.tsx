type SummaryCounts = {
  entityTypes: number;
  locationTypes: number;
  containmentRules: number;
  relationshipTypes: number;
  issues: number;
};

type SummaryIssue = {
  id: string;
  label: string;
  count: number;
  onClick?: () => void;
};

type InlineSummaryBarProps = {
  counts: SummaryCounts;
  issues?: SummaryIssue[];
};

export default function InlineSummaryBar({ counts, issues = [] }: InlineSummaryBarProps) {
  return (
    <div className="inline-summary">
      <div className="inline-summary__counts">
        <div>
          <strong>{counts.entityTypes}</strong>
          <span>Entity types</span>
        </div>
        <div>
          <strong>{counts.locationTypes}</strong>
          <span>Location types</span>
        </div>
        <div>
          <strong>{counts.containmentRules}</strong>
          <span>Derived containment rules</span>
        </div>
        <div>
          <strong>{counts.relationshipTypes}</strong>
          <span>Relationship types</span>
        </div>
        <div>
          <strong>{counts.issues}</strong>
          <span>Issues</span>
        </div>
      </div>
      {issues.length > 0 ? (
        <div className="inline-summary__issues">
          {issues.map((issue) => (
            <button
              type="button"
              key={issue.id}
              className="inline-summary__issue"
              onClick={issue.onClick}
            >
              {issue.label} ({issue.count})
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
