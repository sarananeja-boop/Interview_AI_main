"""Base class for all ORM models — separated to avoid circular imports."""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
