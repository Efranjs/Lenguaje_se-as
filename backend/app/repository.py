from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from app.models import Prediction, Session


def get_or_create_session(db: DbSession, session_id: str, user_agent: str | None = None) -> Session:
    session = db.query(Session).filter(Session.session_id == session_id).first()
    if not session:
        session = Session(session_id=session_id, user_agent=user_agent)
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


def save_prediction(
    db: DbSession,
    session_id_fk: int,
    word: str | None,
    label: str | None,
    confidence: float | None,
    hands_detected: bool | None,
    model_loaded: bool | None,
    sentence: str | None = None,
) -> Prediction:
    pred = Prediction(
        session_id_fk=session_id_fk,
        word=word,
        label=label,
        confidence=confidence,
        hands_detected=hands_detected,
        model_loaded=model_loaded,
        sentence=sentence,
    )
    db.add(pred)
    db.commit()
    return pred


def get_session_history(db: DbSession, session_id: str) -> Session | None:
    return db.query(Session).filter(Session.session_id == session_id).first()


def get_all_sessions(db: DbSession, limit: int = 50) -> list[Session]:
    return db.query(Session).order_by(Session.created_at.desc()).limit(limit).all()


def get_predictions_by_session(db: DbSession, session_id_fk: int, limit: int = 100) -> list[Prediction]:
    return (
        db.query(Prediction)
        .filter(Prediction.session_id_fk == session_id_fk)
        .order_by(Prediction.created_at.desc())
        .limit(limit)
        .all()
    )


def end_session(db: DbSession, session_id: str) -> None:
    session = db.query(Session).filter(Session.session_id == session_id).first()
    if session:
        session.ended_at = datetime.now(timezone.utc)
        db.commit()
