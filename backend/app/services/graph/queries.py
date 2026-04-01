"""Pre-built Cypher queries for the graph API endpoints."""

import logging
from app.schemas.graph import GraphData, GraphNode, GraphEdge, GraphFilter
from app.services.graph.graph_builder import NODE_COLORS
from app.services.graph.neo4j_client import run_query

logger = logging.getLogger(__name__)


def _build_node(node_id: str, label: str, node_type: str, props: dict = None) -> GraphNode:
    return GraphNode(
        id=node_id,
        label=label,
        type=node_type,
        properties=props or {},
        color=NODE_COLORS.get(node_type, "#888"),
        size=_node_size(node_type),
    )


def _node_size(node_type: str) -> float:
    sizes = {"company": 8, "job": 5, "skill": 4, "location": 6, "portal": 5, "user": 7}
    return sizes.get(node_type, 4)


async def get_full_graph(filters: GraphFilter) -> GraphData:
    """Get the full graph (or filtered subset) for visualization."""
    try:
        # Build node type filter
        type_filter = ""
        if filters.node_types:
            labels = "|".join(t.capitalize() for t in filters.node_types)
            type_filter = f"WHERE any(label IN labels(n) WHERE label IN [{', '.join(repr(t.capitalize()) for t in filters.node_types)}])"

        # Fetch nodes
        node_query = f"""
            MATCH (n)
            {type_filter}
            RETURN
                id(n) AS id,
                labels(n) AS labels,
                n AS props
            LIMIT {filters.limit}
        """
        raw_nodes = run_query(node_query)

        # Fetch relationships between those nodes
        edge_query = f"""
            MATCH (a)-[r]->(b)
            {type_filter.replace('(n)', '(a)') if type_filter else ''}
            RETURN
                id(a) AS source_id,
                id(b) AS target_id,
                type(r) AS rel_type,
                properties(r) AS props
            LIMIT {filters.limit * 2}
        """
        raw_edges = run_query(edge_query)

        return _build_graph_data(raw_nodes, raw_edges)

    except Exception as e:
        logger.error(f"get_full_graph failed: {e}")
        return GraphData(nodes=[], edges=[])


async def get_company_subgraph(company_name: str) -> GraphData:
    """Get all jobs, skills, and locations for a company."""
    try:
        raw_nodes = run_query(
            """
            MATCH (c:Company {name: $name})
            OPTIONAL MATCH (j:Job)-[:POSTED_BY]->(c)
            OPTIONAL MATCH (j)-[:REQUIRES_SKILL]->(s:Skill)
            OPTIONAL MATCH (j)-[:LOCATED_IN]->(l:Location)
            RETURN
                id(c) AS id, labels(c) AS labels, c AS props
            UNION
            MATCH (c:Company {name: $name})
            MATCH (j:Job)-[:POSTED_BY]->(c)
            RETURN id(j) AS id, labels(j) AS labels, j AS props
            UNION
            MATCH (c:Company {name: $name})
            MATCH (j:Job)-[:POSTED_BY]->(c)
            MATCH (j)-[:REQUIRES_SKILL]->(s:Skill)
            RETURN id(s) AS id, labels(s) AS labels, s AS props
            UNION
            MATCH (c:Company {name: $name})
            MATCH (j:Job)-[:POSTED_BY]->(c)
            MATCH (j)-[:LOCATED_IN]->(l:Location)
            RETURN id(l) AS id, labels(l) AS labels, l AS props
            """,
            {"name": company_name},
        )
        raw_edges = run_query(
            """
            MATCH (c:Company {name: $name})
            MATCH (j:Job)-[r]->(c)
            RETURN id(j) AS source_id, id(c) AS target_id, type(r) AS rel_type, {} AS props
            UNION
            MATCH (c:Company {name: $name})
            MATCH (j:Job)-[:POSTED_BY]->(c)
            MATCH (j)-[r]->(x)
            WHERE x:Skill OR x:Location
            RETURN id(j) AS source_id, id(x) AS target_id, type(r) AS rel_type, {} AS props
            """,
            {"name": company_name},
        )
        return _build_graph_data(raw_nodes, raw_edges)
    except Exception as e:
        logger.error(f"get_company_subgraph failed: {e}")
        return GraphData(nodes=[], edges=[])


async def get_skill_subgraph(skill_name: str) -> GraphData:
    """Get all jobs and companies requiring a skill."""
    try:
        raw_nodes = run_query(
            """
            MATCH (s:Skill {name: $name})
            OPTIONAL MATCH (j:Job)-[:REQUIRES_SKILL]->(s)
            OPTIONAL MATCH (c:Company)-[:HIRES_FOR]->(s)
            RETURN id(s) AS id, labels(s) AS labels, s AS props
            UNION
            MATCH (s:Skill {name: $name})
            MATCH (j:Job)-[:REQUIRES_SKILL]->(s)
            RETURN id(j) AS id, labels(j) AS labels, j AS props
            UNION
            MATCH (s:Skill {name: $name})
            MATCH (c:Company)-[:HIRES_FOR]->(s)
            RETURN id(c) AS id, labels(c) AS labels, c AS props
            """,
            {"name": skill_name},
        )
        raw_edges = run_query(
            """
            MATCH (s:Skill {name: $name})
            MATCH (j:Job)-[r:REQUIRES_SKILL]->(s)
            RETURN id(j) AS source_id, id(s) AS target_id, type(r) AS rel_type, {} AS props
            UNION
            MATCH (s:Skill {name: $name})
            MATCH (c:Company)-[r:HIRES_FOR]->(s)
            RETURN id(c) AS source_id, id(s) AS target_id, type(r) AS rel_type, {} AS props
            """,
            {"name": skill_name},
        )
        return _build_graph_data(raw_nodes, raw_edges)
    except Exception as e:
        logger.error(f"get_skill_subgraph failed: {e}")
        return GraphData(nodes=[], edges=[])


async def get_similar_jobs_graph(job_id: str, limit: int = 10) -> GraphData:
    """Get similar jobs using Qdrant embeddings, return as graph."""
    from app.services.rag.retriever import search_similar_jobs
    from app.services.graph.neo4j_client import run_query

    similar = await search_similar_jobs(job_id, limit=limit)
    if not similar:
        return GraphData(nodes=[], edges=[])

    similar_ids = [s["job_id"] for s in similar if s.get("job_id")]

    # Get the source job and similar jobs from Neo4j
    try:
        raw_nodes = run_query(
            """
            MATCH (j:Job) WHERE j.job_id IN $ids
            RETURN id(j) AS id, labels(j) AS labels, j AS props
            """,
            {"ids": [job_id] + similar_ids},
        )

        # Build similarity edges
        edges = []
        for s in similar:
            if s.get("job_id") and s["job_id"] != job_id:
                edges.append(GraphEdge(
                    source=job_id,
                    target=s["job_id"],
                    label="SIMILAR_TO",
                    properties={"score": s["score"]},
                ))

        nodes = _parse_nodes(raw_nodes)
        return GraphData(nodes=nodes, edges=edges, stats={"similar_count": len(edges)})
    except Exception as e:
        logger.error(f"get_similar_jobs_graph failed: {e}")
        return GraphData(nodes=[], edges=[])


def _build_graph_data(raw_nodes: list, raw_edges: list) -> GraphData:
    nodes = _parse_nodes(raw_nodes)
    node_ids = {n.id for n in nodes}

    edges = []
    seen_edges = set()
    for r in raw_edges:
        src = str(r.get("source_id", ""))
        tgt = str(r.get("target_id", ""))
        rel = r.get("rel_type", "RELATED")

        if src and tgt and src in node_ids and tgt in node_ids:
            edge_key = f"{src}-{rel}-{tgt}"
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                edges.append(GraphEdge(
                    source=src,
                    target=tgt,
                    label=rel,
                    properties=r.get("props", {}),
                ))

    stats = {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "companies": sum(1 for n in nodes if n.type == "company"),
        "jobs": sum(1 for n in nodes if n.type == "job"),
        "skills": sum(1 for n in nodes if n.type == "skill"),
    }

    return GraphData(nodes=nodes, edges=edges, stats=stats)


def _parse_nodes(raw_nodes: list) -> list[GraphNode]:
    nodes = []
    seen_ids = set()

    for r in raw_nodes:
        node_id = str(r.get("id", ""))
        if not node_id or node_id in seen_ids:
            continue
        seen_ids.add(node_id)

        labels = r.get("labels", [])
        node_type = labels[0].lower() if labels else "unknown"
        props = dict(r.get("props", {})) if r.get("props") else {}

        # Determine display label
        label = (
            props.get("name") or props.get("title") or
            props.get("job_id") or node_id[:8]
        )

        nodes.append(_build_node(node_id, label, node_type, props))

    return nodes
