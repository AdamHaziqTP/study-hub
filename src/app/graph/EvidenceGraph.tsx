"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import {
  RELATIONSHIP_HEX,
  RELATIONSHIP_LABELS,
  type EvidenceRelationship,
} from "@/lib/articles";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

const WIDTH = 1100;
const HEIGHT = 700;

type NodeType = "article" | "claim" | "study";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  type: NodeType;
  /** Visible label (full text, wrapped inside the bubble). */
  label: string;
  /** Full text shown in the native SVG tooltip. */
  fullLabel: string;
  /** Where a click on this node navigates. */
  href: string;
  radius: number;
  /** Size of the HTML label box inside the bubble (text wraps to fit). */
  boxW: number;
  boxH: number;
  fill: string;
  textFill: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  kind: "membership" | "evidence";
  relationship?: EvidenceRelationship;
  color: string;
  source: string | GraphNode;
  target: string | GraphNode;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  counts: {
    articles: number;
    claims: number;
    studies: number;
    links: number;
  };
}

/**
 * Measure a label so the FULL text fits (wrapped) inside the node bubble.
 * Returns the HTML label box size (a comfortable fixed width that the text
 * wraps within) and a radius large enough to hold that box inside the circle.
 */
const measureLabel = (type: NodeType, text: string) => {
  const charW = type === "article" ? 7.2 : type === "study" ? 6.6 : 5.8;
  const lineH = type === "article" ? 14 : type === "study" ? 13 : 12;
  const targetW = 84; // fixed, comfortable box width (px)
  const charsPerLine = Math.max(1, Math.floor((targetW - 8) / charW));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const boxW = targetW;
  const boxH = lines * lineH + 8;
  // A square of side s fits in a circle of radius r when r >= s/2 * sqrt(2).
  const side = Math.max(boxW, boxH);
  const radius = Math.ceil((side / 2) * Math.sqrt(2)) + 2;
  return { boxW, boxH, radius };
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * EvidenceGraph — Task 8.
 *
 * Visualizes the signed-in user's evidence graph:
 *   articles ──(membership)──> claims ──(evidence)──> studies
 *
 * Physics: d3-force. The force simulation owns ALL node movement:
 *   - forceLink        — pulls linked nodes together (straight 1px edges)
 *   - forceManyBody    — global repulsion so clusters don't collapse
 *   - forceCollide     — keeps node circles from overlapping
 *   - forceCenter      — keeps the whole graph centered in the SVG
 *
 * Rendering: a self-contained SVG (<viewBox>, <defs> arrows, <g> for links
 * and nodes). Node click → router.push(article editor | study page).
 *
 * Data: loaded client-side via the @supabase/ssr browser client so RLS
 * filters every row to auth.uid() = user_id (the same pattern as /articles
 * and StudyReferences).
 */
export default function EvidenceGraph() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);

  // Pan/zoom view state: translate (x,y) + scale (k). Zoom keeps the point
  // under the cursor fixed; left-drag pans. Supports zooming into any spot.
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  /** Zoom by `factor` while keeping the world point at (px, py) under the cursor. */
  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    setView((v) => {
      const k = clamp(v.k * factor, 0.4, 4);
      const wx = (px - v.x) / v.k;
      const wy = (py - v.y) / v.k;
      return { k, x: px - wx * k, y: py - wy * k };
    });
  }, []);

  // +/- buttons zoom toward the centre of the viewport.
  const zoomBy = (factor: number) => zoomAt(WIDTH / 2, HEIGHT / 2, factor);
  const resetZoom = () => setView({ x: 0, y: 0, k: 1 });

  // Simulation instance persists across renders; only re-created when the
  // loaded graph changes (or the auth user changes).
  const simulationRef = useRef<Simulation<GraphNode, GraphLink> | null>(null);

  /** Query the user's own ARTICLES → CLAIMS → EVIDENCE_LINKS → STUDIES. */
  const loadGraph = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // 1) The user's articles.
      const { data: articleRows, error: articleError } = await supabase
        .from("articles")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (articleError) throw articleError;

      // 2) Claims for those articles.
      const articleIds = (articleRows ?? []).map((a) => a.id as string);
      const { data: claimRows, error: claimError } =
        articleIds.length > 0
          ? await supabase
              .from("claims")
              .select("id, article_id, text, created_at")
              .in("article_id", articleIds)
              .order("created_at", { ascending: true })
          : { data: [], error: null };
      if (claimError) throw claimError;

      // 3) Evidence links (+ the linked studies, which are public-read).
      const claimIds = (claimRows ?? []).map((c) => c.id as string);
      const { data: linkRows, error: linkError } =
        claimIds.length > 0
          ? await supabase
              .from("evidence_links")
              .select(
                "id, relationship, claim_id, studies(id, pmid, title, journal)"
              )
              .in("claim_id", claimIds)
          : { data: [], error: null };
      if (linkError) throw linkError;

      // ---- Build the graph data structure ----

      type LinkRow = {
        id: string;
        relationship: EvidenceRelationship;
        claim_id: string;
        studies: {
          id: string;
          pmid: string;
          title: string;
          journal: string | null;
        } | null;
      };

      const rawLinks = (linkRows ?? []) as LinkRow[];
      const studyById = new Map<string, LinkRow["studies"] & object>();

      for (const row of rawLinks) {
        if (row.studies) {
          studyById.set(row.studies.id, row.studies);
        }
      }

      const nodes: GraphNode[] = [];
      const links: GraphLink[] = [];
      const nodeById = new Map<string, GraphNode>();

      const addNode = (node: GraphNode) => {
        nodeById.set(node.id, node);
        nodes.push(node);
      };

      // Articles (large violet circles, banded to the top region).
      const articleRowsTyped = (articleRows ?? []) as {
        id: string;
        title: string;
        updated_at: string;
      }[];
      articleRowsTyped.forEach((article, i) => {
        const title = article.title || "Untitled article";
        const label = title;
        const { boxW, boxH, radius } = measureLabel("article", label);
        addNode({
          id: article.id,
          type: "article",
          label,
          fullLabel: `Article: ${title}`,
          href: `/articles/${article.id}`,
          radius,
          boxW,
          boxH,
          fill: "#7c3aed", // violet-600
          textFill: "#ffffff",
          // Banded start position (d3-force takes over immediately).
          x: 80 + (i % 5) * 240,
          y: 90 + Math.floor(i / 5) * 80,
        });
      });

      // Claims (small dark circles, banded near their article's x).
      const claimRowsTyped = (claimRows ?? []) as {
        id: string;
        article_id: string;
        text: string;
        created_at: string;
      }[];
      claimRowsTyped.forEach((claim) => {
        const parent = nodeById.get(claim.article_id);
        const text = claim.text || "Untitled claim";
        const label = text;
        const { boxW, boxH, radius } = measureLabel("claim", label);
        addNode({
          id: claim.id,
          type: "claim",
          label,
          fullLabel: `Claim: ${text}`,
          href: `/articles/${claim.article_id}`,
          radius,
          boxW,
          boxH,
          fill: "#1f2937", // gray-800
          textFill: "#ffffff",
          x: parent?.x ?? WIDTH / 2,
          y: 260 + Math.random() * 120,
        });
      });

      // Studies (medium blue circles, banded to the bottom region).
      for (const study of studyById.values()) {
        const label = study.title;
        const { boxW, boxH, radius } = measureLabel("study", label);
        addNode({
          id: study.id,
          type: "study",
          label,
          fullLabel: `Study (PMID ${study.pmid}): ${study.title}`,
          href: `/study/${study.pmid}`,
          radius,
          boxW,
          boxH,
          fill: "#2563eb", // blue-600
          textFill: "#ffffff",
          x: 80 + (nodes.length % 6) * 200,
          y: 580,
        });
      }

      // Membership edges: article → claim (1px #d1d5db, no arrow).
      for (const claim of claimRowsTyped) {
        links.push({
          id: `membership:${claim.id}`,
          kind: "membership",
          color: "#d1d5db",
          source: claim.article_id,
          target: claim.id,
        });
      }

      // Evidence edges: claim → study, colored by relationship (arrows).
      for (const row of rawLinks) {
        links.push({
          id: `evidence:${row.id}`,
          kind: "evidence",
          relationship: row.relationship,
          color: RELATIONSHIP_HEX[row.relationship],
          source: row.claim_id,
          target: row.studies?.id ?? row.claim_id,
        });
      }

      setGraph({
        nodes,
        links,
        counts: {
          articles: nodeById.size ? articleRowsTyped.length : 0,
          claims: claimRowsTyped.length,
          studies: studyById.size,
          links: rawLinks.length,
        },
      });
    } catch (err) {
      console.error("Evidence graph load failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // 1) Resolve the session once.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setUserId(data.user?.id ?? null);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setUserId(null);
          setAuthLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Load the graph once the user is known.
  useEffect(() => {
    if (userId) loadGraph();
  }, [userId, loadGraph]);

  // Wheel-to-zoom-at-cursor + left-drag-to-pan on the SVG (native listeners so
  // preventDefault works). Attached once the graph is loaded / SVG is mounted.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
      const py = ((e.clientY - rect.top) / rect.height) * HEIGHT;
      zoomAt(px, py, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };

    let lastX = 0;
    let lastY = 0;
    const onDown = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      draggingRef.current = false;
    };
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        draggingRef.current = true;
        const rect = el.getBoundingClientRect();
        const scaleX = WIDTH / rect.width;
        const scaleY = HEIGHT / rect.height;
        setView((v) => ({ ...v, x: v.x + dx * scaleX, y: v.y + dy * scaleY }));
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };
    const onUp = () => {
      // Let the node onClick (fired on mouseup) see the drag was a pan.
      setTimeout(() => {
        draggingRef.current = false;
      }, 50);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("mouseleave", onUp);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("mouseleave", onUp);
    };
  }, [graph, zoomAt]);

  // Force a re-render on every simulation tick (positions are mutated in place).
  const [, setTick] = useState(0);

  // 3) Run the d3-force simulation whenever the graph is (re)loaded.
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;

    // Clean up any previous simulation.
    simulationRef.current?.stop();

    const simulation = forceSimulation(graph.nodes as GraphNode[])
      .force(
        "link",
        forceLink(graph.links as GraphLink[])
          .id((d) => (d as GraphNode).id)
          .distance((link) => {
            const l = link as GraphLink;
            return l.kind === "membership" ? 70 : 130;
          })
          .strength((link) => {
            const l = link as GraphLink;
            return l.kind === "membership" ? 0.7 : 0.35;
          })
      )
      .force("charge", forceManyBody<GraphNode>().strength(-520))
      .force(
        "collide",
        forceCollide<GraphNode>()
          .radius((d) => d.radius + 26)
          .iterations(2)
      )
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .on("tick", () => {
        // Re-render by letting React read the mutated node/link positions.
        setTick((t) => t + 1);
      });

    simulationRef.current = simulation;

    // Optional: settle near-stable after a while to save CPU.
    const settleTimer = window.setTimeout(() => {
      simulation.alphaTarget(0).stop();
    }, 12000);

    return () => {
      window.clearTimeout(settleTimer);
      simulation.stop();
      simulationRef.current = null;
    };
  }, [graph]);

  const handleSignIn = useCallback(async () => {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname
    )}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo },
    });
    if (error) console.error("Sign-in failed:", error.message);
  }, []);

  // ---- Unauthenticated ----
  if (!authLoading && !userId) {
    return (
      <div className="p-12 rounded-xl border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 text-center">
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Log in to view your evidence graph
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
          Visualize how your articles, claims, and saved studies connect — with
          supports, contradicts, mixed, and contextual relationships as colored
          edges.
        </p>
        <button
          onClick={handleSignIn}
          className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          Sign in with GitHub
        </button>
      </div>
    );
  }

  // ---- Auth loading ----
  if (authLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="p-6 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 animate-pulse"
          >
            <div className="h-4 w-1/2 bg-gray-200 rounded mb-3" />
            <div className="h-3 w-3/4 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // ---- Empty state ----
  if (!loading && graph && graph.nodes.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900 rounded-xl p-12 text-center">
        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          No evidence graph yet
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Write an article, add a claim, and link it to a study. Your graph
          appears here automatically.
        </p>
        <Link
          href="/articles"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Go to My Articles →
        </Link>
      </div>
    );
  }

  // ---- Ready: render the SVG ----
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 p-4 shadow-sm">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {graph && graph.nodes.length > 0 && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Legend
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <span className="inline-block w-3 h-3 rounded-full bg-violet-600" />
              Article
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <span className="inline-block w-3 h-3 rounded-full bg-gray-800" />
              Claim
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-600" />
              Study
            </span>
            {(Object.keys(RELATIONSHIP_LABELS) as EvidenceRelationship[]).map(
              (r) => (
                <span
                  key={r}
                  className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400"
                >
                  <span
                    className="inline-block w-4"
                    style={{ borderTop: `3px solid ${RELATIONSHIP_HEX[r]}` }}
                  />
                  {RELATIONSHIP_LABELS[r]}
                </span>
              )
            )}
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              {graph.counts.articles} article
              {graph.counts.articles === 1 ? "" : "s"} ·{" "}
              {graph.counts.claims} claim
              {graph.counts.claims === 1 ? "" : "s"} ·{" "}
              {graph.counts.studies} study
              {graph.counts.studies === 1 ? "" : "s"} ·{" "}
              {graph.counts.links} link
              {graph.counts.links === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              onClick={() => zoomBy(1.25)}
              className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => zoomBy(1 / 1.25)}
              className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={resetZoom}
              className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Reset zoom"
            >
              Reset
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {Math.round(view.k * 100)}% · scroll to zoom to cursor, drag to pan
            </span>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="w-full h-auto border border-gray-200 rounded-lg bg-gray-50 dark:border-gray-700 dark:bg-gray-800 select-none cursor-grab"
            role="img"
            aria-label="Interactive evidence graph: articles, claims, and studies connected by relationship-colored edges"
          >
            <defs>
              {/* Arrowhead for evidence edges (claim → study). */}
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
              </marker>
            </defs>

            {/* Pan/zoom wrapper for edges + nodes. */}
            <g
              transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
            >
            {/* Edges */}
            <g>
              {graph.links.map((link) => {
                const s = link.source as GraphNode;
                const t = link.target as GraphNode;
                if (!s?.x || !t?.x) return null;
                const isEvidence = link.kind === "evidence";
                return (
                  <line
                    key={link.id}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={link.color}
                    strokeWidth={isEvidence ? 2.5 : 1.5}
                    strokeOpacity={isEvidence ? 1 : 0.45}
                    markerEnd={isEvidence ? "url(#arrow)" : undefined}
                    className="pointer-events-none"
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {graph.nodes.map((node) => (
                <g
                  key={node.id}
                  transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                  className="cursor-pointer"
                  onClick={() => {
                    if (draggingRef.current) return; // was a pan, not a click
                    router.push(node.href);
                  }}
                >
                  <title>{node.fullLabel}</title>
                  <circle
                    r={node.radius}
                    fill={node.fill}
                    stroke="#ffffff"
                    strokeWidth={2}
                    className="hover:opacity-80 transition-opacity"
                  />
                  {/* HTML label inside the bubble — wraps so the FULL text stays within the circle. */}
                  <foreignObject
                    x={-node.boxW / 2}
                    y={-node.boxH / 2}
                    width={node.boxW}
                    height={node.boxH}
                    pointerEvents="none"
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        color: node.textFill,
                        fontSize: node.type === "article" ? 11 : 9.5,
                        fontWeight: 600,
                        lineHeight: 1.1,
                        overflowWrap: "break-word",
                        wordBreak: "break-word",
                        padding: 2,
                        userSelect: "none",
                        cursor: "inherit",
                      }}
                    >
                      {node.label}
                    </div>
                  </foreignObject>
                </g>
              ))}
            </g>
            </g>
          </svg>

          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            Click any node to open its article editor or study page. Positions
            are computed live by d3-force.
          </p>
        </>
      )}
    </div>
  );
}