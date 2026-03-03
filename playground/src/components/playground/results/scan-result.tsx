'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  User,
  KeyRound,
  Fish,
  Bug,
  FileWarning,
  Globe,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface Risk {
  type: string;
  severity: string;
  description: string;
  location?: string;
  matched?: string;
  redacted?: string;
}

interface ScanData {
  safe: boolean;
  risks?: Risk[];
  blocked?: boolean;
  requiresApproval?: boolean;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

const typeBadgeColors: Record<string, string> = {
  pii: 'bg-blue-100 text-blue-800',
  credential: 'bg-red-100 text-red-800',
  phishing: 'bg-purple-100 text-purple-800',
  malware: 'bg-red-200 text-red-900',
  policy: 'bg-orange-100 text-orange-800',
  domain: 'bg-cyan-100 text-cyan-800',
  custom: 'bg-gray-100 text-gray-800',
};

const typeIcons: Record<string, typeof User> = {
  pii: User,
  credential: KeyRound,
  phishing: Fish,
  malware: Bug,
  policy: FileWarning,
  domain: Globe,
};

interface RiskGroup {
  type: string;
  label: string;
  risks: Risk[];
}

function groupRisks(risks: Risk[]): RiskGroup[] {
  const groups: Record<string, Risk[]> = {};
  for (const risk of risks) {
    const key = risk.type || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(risk);
  }

  const labels: Record<string, string> = {
    pii: 'PII',
    credential: 'Credentials',
    phishing: 'Phishing',
    malware: 'Malware',
    policy: 'Policy',
    domain: 'Domain',
    custom: 'Custom',
  };

  return Object.entries(groups)
    .map(([type, items]) => ({
      type,
      label: labels[type] || type.charAt(0).toUpperCase() + type.slice(1),
      risks: items,
    }))
    .sort((a, b) => {
      const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const aSev = Math.min(...a.risks.map((r) => sevOrder[r.severity] ?? 4));
      const bSev = Math.min(...b.risks.map((r) => sevOrder[r.severity] ?? 4));
      return aSev - bSev;
    });
}

function RiskCard({ risk }: { risk: Risk }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border">
      <span
        className={`mt-1 size-2.5 rounded-full shrink-0 ${severityColors[risk.severity] || 'bg-gray-400'}`}
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {risk.severity}
          </Badge>
        </div>
        <p className="text-sm">{risk.description}</p>
        {risk.matched && (
          <code className="text-xs font-mono bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200">
            {risk.matched}
          </code>
        )}
        {risk.location && (
          <p className="text-[10px] text-muted-foreground">Location: {risk.location}</p>
        )}
      </div>
    </div>
  );
}

function CollapsibleRiskGroup({ group }: { group: RiskGroup }) {
  const [open, setOpen] = useState(false);
  const Icon = typeIcons[group.type] || HelpCircle;

  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{group.label}</span>
        <Badge
          variant="outline"
          className={`text-[10px] ${typeBadgeColors[group.type] || 'bg-gray-100 text-gray-800'}`}
        >
          {group.risks.length}
        </Badge>
      </div>
      {open && (
        <div className="p-3 pt-0 space-y-2">
          {group.risks.map((risk, i) => (
            <RiskCard key={i} risk={risk} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBanner({ result }: { result: ScanData }) {
  if (result.safe) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200">
        <ShieldCheck className="size-5 text-green-600" />
        <span className="text-sm font-medium text-green-800">Safe — No risks detected</span>
      </div>
    );
  }

  if (result.blocked) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200">
        <ShieldX className="size-5 text-red-600" />
        <span className="text-sm font-medium text-red-800">Blocked — Content was rejected</span>
      </div>
    );
  }

  if (result.requiresApproval) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200">
        <AlertTriangle className="size-5 text-yellow-600" />
        <span className="text-sm font-medium text-yellow-800">
          Requires Approval — Manual review needed
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-md bg-orange-50 border border-orange-200">
      <ShieldAlert className="size-5 text-orange-600" />
      <span className="text-sm font-medium text-orange-800">Risks Found</span>
    </div>
  );
}

export function ScanResultView({ data }: { data: unknown }) {
  const result = data as ScanData;
  const risks = result.risks || [];
  const groups = groupRisks(risks);

  return (
    <div className="space-y-3">
      <StatusBanner result={result} />

      {groups.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {risks.length} risk{risks.length !== 1 ? 's' : ''} detected
          </h4>

          <div className="space-y-2">
            {groups.map((group) => (
              <CollapsibleRiskGroup key={group.type} group={group} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
