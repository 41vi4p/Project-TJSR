"""Per-stage progress reporting onto the research_requests queue doc, so the
frontend's polling checklist can show live pipeline state."""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

STAGES = ["validate", "cache_check", "collect", "red_flags", "synthesize", "position_analysis"]


class StageReporter:
    """Updates progress.<stage> on the request document. Failures to write
    progress are never fatal to the pipeline itself."""

    def __init__(self, doc_ref):
        self._ref = doc_ref

    def _write(self, stage: str, status: str):
        try:
            self._ref.update({
                f"progress.{stage}": {
                    "status": status,
                    "at": datetime.now(timezone.utc),
                }
            })
        except Exception as exc:
            logger.warning(f"progress write failed ({stage}={status}): {exc}")

    def start(self, stage: str):
        self._write(stage, "running")

    def done(self, stage: str):
        self._write(stage, "done")

    def fail(self, stage: str):
        self._write(stage, "failed")

    def skip_to_done(self, *stages: str):
        """Mark stages done without running them (cache-hit path)."""
        for stage in stages:
            self._write(stage, "done")
