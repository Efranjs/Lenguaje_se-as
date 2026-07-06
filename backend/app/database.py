from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_DIR = Path(__file__).resolve().parents[2] / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DB_DIR / 'signai.db'}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import Prediction, Session, User  # noqa: F401

    Base.metadata.create_all(bind=engine)

    from sqlalchemy import select
    from app.auth import hash_password

    db = SessionLocal()
    try:
        existing = db.execute(select(User).where(User.username == "admin")).scalar_one_or_none()
        if not existing:
            db.add(
                User(
                    username="admin",
                    hashed_password=hash_password("admin"),
                    is_admin=True,
                )
            )
            db.commit()
            import logging

            logging.getLogger("signai.backend").info("Admin user created (admin/admin)")
    finally:
        db.close()
