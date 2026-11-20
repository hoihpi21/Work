from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    settings = get_settings()
    settings.storage_path.mkdir(parents=True, exist_ok=True)
    connect_args = (
        {"check_same_thread": False}
        if settings.database_url.startswith("sqlite")
        else {}
    )
    return create_engine(settings.database_url, connect_args=connect_args, future=True)


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    from sqlalchemy import text

    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    # Safe additive migration for existing SQLite databases
    with engine.begin() as conn:
        try:
            cols = [
                row[1]
                for row in conn.execute(text("PRAGMA table_info(projects)")).fetchall()
            ]
            if "voice_style_prompt" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE projects ADD COLUMN voice_style_prompt TEXT DEFAULT ''"
                    )
                )
        except Exception:
            pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
