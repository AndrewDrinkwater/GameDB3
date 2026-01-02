import React from "react";

export type SchemaSummaryCounts = {
  entityTypes: number;
  locationTypes: number;
  containmentRules: number;
  relationshipTypes: number;
  issues: number;
};

export type SchemaSummaryIssue = {
  id: string;
  label: string;
  count: number;
  onClick?: () => void;
};

type SchemaSummaryBarProps = {
  counts: SchemaSummaryCounts;
  issues?: SchemaSummaryIssue[];
};

export default function SchemaSummaryBar({ counts, issues = [] }: SchemaSummaryBarProps) {
  return (
    <div className="schema-summary">
      <div className="schema-summary__counts">
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
        <div className="schema-summary__issues">
          {issues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              className="schema-summary__issue"
              onClick={issue.onClick}
            >
              <span>{issue.label}</span>
              <span>{issue.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
