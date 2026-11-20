from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import AsyncGenerator

from app.db import SessionLocal
from app.models import Project, RenderJob


class JobManager:
    """In-process async background job coordinator with SSE progress streaming."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def create_job(self, project_id: str, stage: str, message: str = "Queued") -> str:
        with SessionLocal() as db:
            job = RenderJob(
                project_id=project_id,
                stage=stage,
                status="queued",
                progress=0,
                message=message,
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            return job.id

    def update_job(
        self,
        job_id: str,
        *,
        status: str | None = None,
        progress: int | None = None,
        message: str | None = None,
    ) -> dict:
        with SessionLocal() as db:
            job = db.get(RenderJob, job_id)
            if not job:
                return {}
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = max(0, min(100, progress))
            if message is not None:
                job.message = message
            db.commit()
            db.refresh(job)
            payload = {
                "id": job.id,
                "project_id": job.project_id,
                "stage": job.stage,
                "status": job.status,
                "progress": job.progress,
                "message": job.message,
            }

        for q in list(self._subscribers.get(job_id, [])):
            q.put_nowait(payload)
        return payload

    def fail_project_and_job(self, project_id: str, job_id: str, err: Exception) -> None:
        msg = str(err) or err.__class__.__name__
        with SessionLocal() as db:
            proj = db.get(Project, project_id)
            if proj:
                proj.status = "error"
                proj.error_message = msg
                db.commit()
        self.update_job(job_id, status="failed", message=msg)

    async def stream_events(self, job_id: str) -> AsyncGenerator[dict, None]:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[job_id].append(queue)
        try:
            # Emit current snapshot immediately
            with SessionLocal() as db:
                job = db.get(RenderJob, job_id)
                if job:
                    snap = {
                        "id": job.id,
                        "project_id": job.project_id,
                        "stage": job.stage,
                        "status": job.status,
                        "progress": job.progress,
                        "message": job.message,
                    }
                    yield snap
                    if job.status in ("completed", "failed"):
                        return

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield event
                    if event.get("status") in ("completed", "failed"):
                        return
                except asyncio.TimeoutError:
                    yield {"type": "heartbeat"}
        finally:
            if queue in self._subscribers.get(job_id, []):
                self._subscribers[job_id].remove(queue)


job_manager = JobManager()
