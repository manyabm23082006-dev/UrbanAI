from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema_up_to_date():
    """
    Lightweight auto-migration for SQLite dev/demo use. Every table this
    app has ever added a column to previously required deleting the
    database file by hand -- that's a real bug class, not a user error,
    and this closes it: on every startup, any column present on a model
    but missing from the actual table is added via ALTER TABLE ADD COLUMN
    (safe because every column we add is nullable).

    This intentionally does NOT handle column removal, renames, or type
    changes, and only runs for SQLite -- a production Postgres deployment
    should use a real migration tool (Alembic) instead. That's the honest
    boundary of what this function is for: keeping local/demo databases
    working across schema changes without manual intervention.
    """
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        existing_tables = set(conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )).scalars().all())
        for table_name, table in Base.metadata.tables.items():
            if table_name not in existing_tables:
                continue  # create_all() will create it fresh — nothing to migrate
            existing_cols = {row[1] for row in conn.execute(text(f'PRAGMA table_info("{table_name}")'))}
            for col in table.columns:
                if col.name in existing_cols:
                    continue
                col_type = col.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {col_type}'))
                print(f"[schema migration] added {table_name}.{col.name} ({col_type})")
        conn.commit()
