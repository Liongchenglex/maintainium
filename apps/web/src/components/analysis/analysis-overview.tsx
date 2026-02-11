'use client';

import { useState, useEffect } from 'react';
import { get, post, ApiError } from '@/lib/api';

interface AnalysisData {
  id: string;
  projectId: string;
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  errorMessage: string | null;
  projectMetadata: {
    frameworks: { name: string; version: string | null }[];
    language: { name: string; version: string | null };
    packageManager: string | null;
    monorepo: { tool: string; packages: { name: string; path: string }[] } | null;
    buildTool: string | null;
    deploymentTargets: string[];
    envVariables: string[];
    entryPoints: string[];
  } | null;
  fileRegistry: {
    path: string;
    language: string;
    sizeBytes: number;
    category: string;
  }[] | null;
  dependencyInventory: {
    name: string;
    currentVersion: string;
    isDirect: boolean;
    isFrameworkCritical: boolean;
  }[] | null;
  apiSurface: {
    routes: {
      path: string;
      method: string;
      handlerFile: string;
      auth: boolean | 'unknown';
    }[];
    externalCalls: {
      service: string;
      url: string;
      callerFile: string;
    }[];
  } | null;
  llmIntelligence: {
    architectureSummary: string;
    businessFlows: {
      name: string;
      description: string;
      files: string[];
    }[];
    techStackNarrative: string;
  } | null;
  analyzedAt: string | null;
  analysisDurationMs: number | null;
}

interface AnalysisOverviewProps {
  projectId: string;
}

export function AnalysisOverview({ projectId }: AnalysisOverviewProps) {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);

  const fetchAnalysis = async () => {
    try {
      const data = await get<AnalysisData>(`/projects/${projectId}/analysis`);
      setAnalysis(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        setAnalysis(null);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load analysis');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [projectId]);

  // Poll while analysis is in progress
  useEffect(() => {
    if (analysis?.status === 'pending' || analysis?.status === 'analyzing') {
      const interval = setInterval(fetchAnalysis, 5000);
      return () => clearInterval(interval);
    }
  }, [analysis?.status]);

  const handleRescan = async () => {
    setRescanning(true);
    try {
      await post(`/projects/${projectId}/analyze`);
      await fetchAnalysis();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        // Analysis already in progress — just refresh
        await fetchAnalysis();
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start analysis');
      }
    } finally {
      setRescanning(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '1.5rem',
    backgroundColor: '#fafafa',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '1.5rem',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
    color: '#333',
  };

  const chipStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 500,
    marginRight: '0.4rem',
    marginBottom: '0.3rem',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    borderBottom: '2px solid #e0e0e0',
    color: '#666',
    fontWeight: 500,
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.4rem 0.75rem',
    borderBottom: '1px solid #f0f0f0',
  };

  if (loading) {
    return <div style={containerStyle}><p style={{ color: '#666' }}>Loading analysis...</p></div>;
  }

  if (error) {
    return <div style={containerStyle}><p style={{ color: '#c62828' }}>{error}</p></div>;
  }

  if (!analysis) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#666', marginBottom: '1rem' }}>No analysis available yet.</p>
        <button onClick={handleRescan} disabled={rescanning} style={buttonStyle}>
          {rescanning ? 'Starting...' : 'Run Analysis'}
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Status header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <StatusBadge status={analysis.status} />
          {analysis.analyzedAt && (
            <span style={{ fontSize: '0.8rem', color: '#888' }}>
              Last analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
              {analysis.analysisDurationMs && ` (${(analysis.analysisDurationMs / 1000).toFixed(1)}s)`}
            </span>
          )}
        </div>
        <button
          onClick={handleRescan}
          disabled={rescanning || analysis.status === 'analyzing'}
          style={buttonStyle}
        >
          {rescanning || analysis.status === 'analyzing' ? 'Analyzing...' : 'Re-scan'}
        </button>
      </div>

      {analysis.status === 'failed' && analysis.errorMessage && (
        <div style={{ padding: '0.75rem', backgroundColor: '#fff3f3', border: '1px solid #ffcdd2', borderRadius: '6px', marginBottom: '1.5rem' }}>
          <p style={{ color: '#c62828', fontSize: '0.85rem', margin: 0 }}>
            Analysis failed: {analysis.errorMessage}
          </p>
        </div>
      )}

      {analysis.status === 'analyzing' && (
        <div style={{ padding: '0.75rem', backgroundColor: '#e3f2fd', border: '1px solid #bbdefb', borderRadius: '6px', marginBottom: '1.5rem' }}>
          <p style={{ color: '#1565c0', fontSize: '0.85rem', margin: 0 }}>
            Analysis in progress... This may take a few minutes.
          </p>
        </div>
      )}

      {/* LLM Intelligence */}
      {analysis.llmIntelligence && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Architecture Overview</h3>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#444' }}>
            {analysis.llmIntelligence.architectureSummary}
          </p>

          {analysis.llmIntelligence.businessFlows.length > 0 && (
            <>
              <h4 style={{ ...sectionTitleStyle, fontSize: '0.9rem', marginTop: '1rem' }}>Business Flows</h4>
              {analysis.llmIntelligence.businessFlows.map((flow, i) => (
                <div key={i} style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #e8e8e8' }}>
                  <strong style={{ fontSize: '0.85rem' }}>{flow.name}</strong>
                  <p style={{ fontSize: '0.8rem', color: '#555', margin: '0.25rem 0' }}>{flow.description}</p>
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>
                    {flow.files.join(' → ')}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Tech Stack */}
      {analysis.projectMetadata && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Tech Stack</h3>
          <div>
            {analysis.projectMetadata.frameworks.map((fw, i) => (
              <span key={i} style={{ ...chipStyle, backgroundColor: '#e8f5e9', color: '#2e7d32' }}>
                {fw.name}{fw.version ? ` ${fw.version}` : ''}
              </span>
            ))}
            <span style={{ ...chipStyle, backgroundColor: '#e3f2fd', color: '#1565c0' }}>
              {analysis.projectMetadata.language.name}
              {analysis.projectMetadata.language.version ? ` (${analysis.projectMetadata.language.version})` : ''}
            </span>
            {analysis.projectMetadata.packageManager && (
              <span style={{ ...chipStyle, backgroundColor: '#fff3e0', color: '#e65100' }}>
                {analysis.projectMetadata.packageManager}
              </span>
            )}
            {analysis.projectMetadata.buildTool && (
              <span style={{ ...chipStyle, backgroundColor: '#fce4ec', color: '#c62828' }}>
                {analysis.projectMetadata.buildTool}
              </span>
            )}
            {analysis.projectMetadata.deploymentTargets.map((target, i) => (
              <span key={i} style={{ ...chipStyle, backgroundColor: '#f3e5f5', color: '#7b1fa2' }}>
                {target}
              </span>
            ))}
          </div>
          {analysis.projectMetadata.monorepo && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>
              Monorepo ({analysis.projectMetadata.monorepo.tool}): {analysis.projectMetadata.monorepo.packages.map((p) => p.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* File Summary */}
      {analysis.fileRegistry && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Files ({analysis.fileRegistry.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {Object.entries(
              analysis.fileRegistry.reduce<Record<string, number>>((acc, f) => {
                acc[f.category] = (acc[f.category] || 0) + 1;
                return acc;
              }, {}),
            )
              .sort((a, b) => b[1] - a[1])
              .map(([category, count]) => (
                <span key={category} style={{ ...chipStyle, backgroundColor: '#f5f5f5', color: '#555', border: '1px solid #e0e0e0' }}>
                  {category}: {count}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Dependencies */}
      {analysis.dependencyInventory && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            Dependencies ({analysis.dependencyInventory.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
            {analysis.dependencyInventory
              .filter((d) => d.isFrameworkCritical)
              .map((dep) => (
                <span key={dep.name} style={{ ...chipStyle, backgroundColor: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9' }}>
                  {dep.name} {dep.currentVersion}
                </span>
              ))}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#888' }}>
            {analysis.dependencyInventory.filter((d) => d.isFrameworkCritical).length} framework-critical,{' '}
            {analysis.dependencyInventory.filter((d) => d.isDirect).length} direct
          </p>
        </div>
      )}

      {/* API Routes */}
      {analysis.apiSurface && analysis.apiSurface.routes.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>API Routes ({analysis.apiSurface.routes.length})</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Method</th>
                <th style={thStyle}>Path</th>
                <th style={thStyle}>Auth</th>
              </tr>
            </thead>
            <tbody>
              {analysis.apiSurface.routes.slice(0, 20).map((route, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <span style={{ ...chipStyle, backgroundColor: methodColor(route.method), color: '#fff', marginRight: 0 }}>
                      {route.method}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.8rem' }}>{route.path}</td>
                  <td style={tdStyle}>
                    {route.auth === true ? 'Yes' : route.auth === false ? 'No' : '?'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {analysis.apiSurface.routes.length > 20 && (
            <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
              ...and {analysis.apiSurface.routes.length - 20} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    pending: { backgroundColor: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' },
    analyzing: { backgroundColor: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9' },
    completed: { backgroundColor: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' },
    failed: { backgroundColor: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a' },
  };

  return (
    <span
      style={{
        padding: '0.2rem 0.6rem',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        ...(styles[status] || {}),
      }}
    >
      {status}
    </span>
  );
}

function methodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: '#2e7d32',
    POST: '#1565c0',
    PUT: '#e65100',
    PATCH: '#7b1fa2',
    DELETE: '#c62828',
  };
  return colors[method] || '#666';
}

const buttonStyle: React.CSSProperties = {
  padding: '0.4rem 1rem',
  borderRadius: '6px',
  border: '1px solid #d0d0d0',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#333',
};
