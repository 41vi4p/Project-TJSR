'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Search, Info, Network, Loader2, Filter } from 'lucide-react';
import { graphApi, type GraphData, type GraphNode, type GraphEdge } from '@/lib/api-client';

// Dynamically import ForceGraph3D (SSR disabled — needs browser/WebGL)
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

interface NodeDetails {
  node: GraphNode;
}

const NODE_TYPE_COLORS: Record<string, string> = {
  company: '#8b5cf6',
  job: '#0ea5e9',
  skill: '#10b981',
  location: '#f59e0b',
  portal: '#ef4444',
  user: '#ec4899',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  company: 'Companies',
  job: 'Jobs',
  skill: 'Skills',
  location: 'Locations',
  portal: 'Job Portals',
};

export default function GraphPage() {
  const [graphData, setGraphData] = useState<{ nodes: object[]; links: object[] }>({ nodes: [], links: [] });
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeDetails | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(Object.keys(NODE_TYPE_LABELS)));
  const graphRef = useRef<unknown>(null);

  const loadGraph = useCallback(async (company?: string, skill?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await graphApi.getData({ company, skill, limit: 500 });
      setRawData(data);
      setStats(data.stats || {});
      applyData(data, activeTypes);
    } catch {
      setError('Could not load graph data. Ensure Neo4j is running and jobs have been scraped.');
    } finally {
      setLoading(false);
    }
  }, [activeTypes]);

  const applyData = (data: GraphData, types: Set<string>) => {
    const filteredNodes = data.nodes.filter(n => types.has(n.type));
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = data.edges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    setGraphData({
      nodes: filteredNodes.map(n => ({
        id: n.id,
        name: n.label,
        type: n.type,
        color: NODE_TYPE_COLORS[n.type] || '#888',
        val: n.size || 1,
        properties: n.properties,
      })),
      links: filteredEdges.map(e => ({
        source: e.source,
        target: e.target,
        name: e.label,
        color: 'rgba(139,92,246,0.3)',
      })),
    });
  };

  useEffect(() => { loadGraph(); }, []);

  useEffect(() => {
    if (rawData) applyData(rawData, activeTypes);
  }, [activeTypes, rawData]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm) return;
    // Try to detect if it's a company or skill search
    if (searchTerm.toLowerCase().startsWith('skill:')) {
      loadGraph(undefined, searchTerm.slice(6).trim());
    } else {
      loadGraph(searchTerm.trim());
    }
  };

  const handleNodeClick = (node: object) => {
    setSelectedNode({ node: node as GraphNode });
  };

  return (
    <div className="max-w-7xl h-[calc(100vh-5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Network size={28} className="text-purple-400" />
            Knowledge Graph
          </h1>
          <p className="text-gray-400 text-sm mt-1">3D visualization of job relationships — click any node to explore</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {Object.entries(stats).map(([k, v]) => (
            <span key={k} className="ml-4 text-gray-400">
              <span className="text-white font-semibold">{v}</span> {k}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 space-y-4 overflow-y-auto">
          {/* Search */}
          <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Search size={14} /> Search
            </h3>
            <form onSubmit={handleSearch} className="space-y-2">
              <input
                type="text"
                placeholder="Company name or skill:Python"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-800 border border-purple-500/20 rounded-lg py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
              />
              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-500 rounded-lg text-white text-sm font-medium hover:shadow-lg smooth-transition"
              >
                Focus Subgraph
              </button>
              <button
                type="button"
                onClick={() => { setSearchTerm(''); loadGraph(); }}
                className="w-full py-2 border border-purple-500/20 rounded-lg text-gray-400 text-sm hover:text-white smooth-transition"
              >
                Reset View
              </button>
            </form>
          </div>

          {/* Node type filters */}
          <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Filter size={14} /> Node Types
            </h3>
            <div className="space-y-2">
              {Object.entries(NODE_TYPE_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm smooth-transition ${
                    activeTypes.has(type)
                      ? 'bg-slate-800 text-white'
                      : 'text-gray-500 hover:text-gray-400'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: NODE_TYPE_COLORS[type] }}
                  />
                  <span>{label}</span>
                  {rawData && (
                    <span className="ml-auto text-xs text-gray-600">
                      {rawData.nodes.filter(n => n.type === type).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Node Details */}
          {selectedNode && (
            <div className="bg-slate-900/50 border border-purple-500/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Info size={14} /> Node Details
              </h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-gray-500">Type</span>
                  <p className="text-sm font-medium capitalize" style={{ color: NODE_TYPE_COLORS[selectedNode.node.type] }}>
                    {selectedNode.node.type}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Label</span>
                  <p className="text-sm text-white">{selectedNode.node.label}</p>
                </div>
                {Object.entries(selectedNode.node.properties || {}).slice(0, 5).map(([k, v]) => (
                  v && (
                    <div key={k}>
                      <span className="text-xs text-gray-500 capitalize">{k.replace(/_/g, ' ')}</span>
                      <p className="text-xs text-gray-300 truncate">{String(v)}</p>
                    </div>
                  )
                ))}
                {selectedNode.node.type === 'company' && (
                  <button
                    onClick={() => { setSearchTerm(selectedNode.node.label); loadGraph(selectedNode.node.label); }}
                    className="w-full mt-2 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-400 text-xs hover:bg-purple-600/30 smooth-transition"
                  >
                    Focus Company Network
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="bg-slate-900/50 border border-purple-500/20 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">Controls</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>🖱️ Left drag — Rotate</li>
              <li>🖱️ Right drag — Pan</li>
              <li>🖱️ Scroll — Zoom</li>
              <li>🖱️ Click node — Details</li>
            </ul>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 bg-slate-950/80 border border-purple-500/20 rounded-lg overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10">
              <div className="text-center">
                <Loader2 size={32} className="text-purple-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Loading knowledge graph…</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center max-w-md px-6">
                <Network size={48} className="text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-sm">{error}</p>
                <button
                  onClick={() => loadGraph()}
                  className="mt-4 px-4 py-2 bg-purple-600/20 border border-purple-500/30 rounded-lg text-purple-400 text-sm hover:bg-purple-600/30 smooth-transition"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {!loading && !error && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <Network size={48} className="text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-sm">No graph data available.</p>
                <p className="text-gray-500 text-xs mt-1">Run the scraper to populate the knowledge graph.</p>
              </div>
            </div>
          )}
          {typeof window !== 'undefined' && graphData.nodes.length > 0 && (
            <ForceGraph3D
              ref={graphRef}
              graphData={graphData}
              backgroundColor="#020617"
              nodeLabel="name"
              nodeColor={(node: object) => (node as { color: string }).color}
              nodeVal={(node: object) => (node as { val: number }).val * 2}
              nodeResolution={12}
              linkColor={(link: object) => (link as { color: string }).color}
              linkWidth={0.5}
              linkDirectionalParticles={1}
              linkDirectionalParticleSpeed={0.005}
              linkDirectionalParticleWidth={1.5}
              onNodeClick={handleNodeClick}
              onNodeHover={(node: object | null) => {
                document.body.style.cursor = node ? 'pointer' : 'default';
              }}
              nodeThreeObject={(node: object) => {
                const n = node as { name: string; type: string; color: string };
                // Create a sprite label for each node
                if (typeof window === 'undefined') return undefined;
                // @ts-ignore — three.js types
                const THREE = require('three');
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 64;
                const ctx = canvas.getContext('2d')!;
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, 256, 64);
                ctx.font = 'bold 18px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(n.name.slice(0, 20), 128, 40);
                const texture = new THREE.CanvasTexture(canvas);
                const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
                const sprite = new THREE.Sprite(material);
                sprite.scale.set(30, 8, 1);
                sprite.position.set(0, 8, 0);
                return sprite;
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
