from __future__ import annotations

import os

from sqlalchemy import ForeignKey, String, create_engine, event, select
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    joinedload,
    mapped_column,
    relationship,
    selectinload,
)


class Base(DeclarativeBase):
    pass


class Author(Base):
    __tablename__ = "authors"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    books: Mapped[list[Book]] = relationship(
        back_populates="author", order_by="Book.id"
    )


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("authors.id"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    author: Mapped[Author] = relationship(back_populates="books")


engine = create_engine(os.environ["DATABASE_URL"])
select_count = 0


@event.listens_for(engine, "before_cursor_execute")
def count_selects(conn, cursor, statement, parameters, context, executemany):
    global select_count
    if statement.lstrip().upper().startswith("SELECT"):
        select_count += 1


def serialize(authors: list[Author]) -> list[tuple[str, list[str]]]:
    return [(author.name, [book.title for book in author.books]) for author in authors]


def load_lazy() -> tuple[int, list[tuple[str, list[str]]]]:
    # TODO: lazy relationship loading
    raise NotImplementedError


def load_joined() -> tuple[int, list[tuple[str, list[str]]]]:
    # TODO: joined eager loading
    raise NotImplementedError


def load_selectin() -> tuple[int, list[tuple[str, list[str]]]]:
    # TODO: select-in eager loading
    raise NotImplementedError


def main() -> None:
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")

    lazy_count, lazy_rows = load_lazy()
    joined_count, joined_rows = load_joined()
    selectin_count, selectin_rows = load_selectin()

    assert lazy_rows == joined_rows == selectin_rows
    assert (lazy_count, joined_count, selectin_count) == (5, 1, 2)
    print(f"lazy={lazy_count} joined={joined_count} selectin={selectin_count}")


if __name__ == "__main__":
    main()
