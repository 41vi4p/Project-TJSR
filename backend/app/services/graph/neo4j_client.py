"""Neo4j driver wrapper with connection pooling."""

import logging
from contextlib import contextmanager
from neo4j import GraphDatabase, Driver
from app.config import get_settings

logger = logging.getLogger(__name__)

_driver: Driver | None = None


def get_driver() -> Driver | None:
    global _driver
    if _driver is not None:
        return _driver
    try:
        settings = get_settings()
        _driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
            max_connection_pool_size=20,
        )
        _driver.verify_connectivity()
        logger.info("Neo4j connected")
    except Exception as e:
        logger.error(f"Neo4j connection failed: {e}")
        _driver = None
    return _driver


def close_driver():
    global _driver
    if _driver:
        _driver.close()
        _driver = None


@contextmanager
def get_session():
    driver = get_driver()
    if not driver:
        raise RuntimeError("Neo4j not available")
    with driver.session() as session:
        yield session


def run_query(cypher: str, params: dict | None = None) -> list[dict]:
    """Run a Cypher query and return results as list of dicts."""
    try:
        with get_session() as session:
            result = session.run(cypher, params or {})
            return [dict(record) for record in result]
    except Exception as e:
        logger.error(f"Neo4j query failed: {e}\nCypher: {cypher}")
        return []


def run_write(cypher: str, params: dict | None = None):
    """Run a write Cypher transaction."""
    try:
        with get_session() as session:
            session.run(cypher, params or {})
    except Exception as e:
        logger.error(f"Neo4j write failed: {e}\nCypher: {cypher}")
