import type { Finding } from '@spectastic/schema';

/**
 * SARIF 2.1.0 formatter (minimal, in-house). Emits the common subset
 * GitHub Code Scanning and GitLab Security Reports both accept.
 * Implements FR-005 of specs/002-validate-cli/spec.html. See D-006 of
 * the plan for the rationale (full SARIF lib is overkill for the
 * subset we emit; vendored schema validates structural correctness).
 */
const TOOL_NAME = 'spectastic';
const TOOL_VERSION = '0.1.0-pre';
const TOOL_URI = 'https://github.com/briancorbinxyz/spectastic';

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: { startLine: number; startColumn: number };
  };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: SarifLocation[];
  relatedLocations?: Array<SarifLocation & { message: { text: string } }>;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: 'error' | 'warning' };
}

interface SarifDocument {
  $schema: string;
  version: '2.1.0';
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
  }>;
}

export function sarifFormatter(findings: readonly Finding[]): string {
  const ruleIds = new Set(findings.map((f) => f.rule));
  const rules: SarifRule[] = Array.from(ruleIds).map((id) => {
    const first = findings.find((f) => f.rule === id);
    return {
      id,
      name: id,
      shortDescription: { text: `Spectastic rule: ${id}` },
      defaultConfiguration: { level: first?.severity ?? 'error' },
    };
  });

  const results: SarifResult[] = findings.map((f) => {
    const result: SarifResult = {
      ruleId: f.rule,
      level: f.severity,
      message: { text: f.fixHint ? `${f.message}\n→ ${f.fixHint}` : f.message },
      locations: [makeLocation(f.file, f.line, f.column)],
    };
    if (f.relatedLocations && f.relatedLocations.length > 0) {
      result.relatedLocations = f.relatedLocations.map((rl) => ({
        ...makeLocation(rl.file, rl.line, rl.column),
        message: { text: 'related location' },
      }));
    }
    return result;
  });

  const doc: SarifDocument = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: TOOL_VERSION,
            informationUri: TOOL_URI,
            rules,
          },
        },
        results,
      },
    ],
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function makeLocation(file: string, line: number, column: number): SarifLocation {
  return {
    physicalLocation: {
      artifactLocation: { uri: file },
      region: { startLine: line, startColumn: column },
    },
  };
}
