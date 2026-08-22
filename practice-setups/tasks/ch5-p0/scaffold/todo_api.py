#!/usr/bin/env python3
"""todo_api.py — in-memory REST todo service (evolve v1 → v2)."""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(title="Todo API", version="1.0.0")  # TODO(v2): bump version to "2.0.0"

# TODO(v2): uncomment Priority and wire it into Todo / TodoCreate / TodoReplace / TodoPatch
# class Priority(str, Enum):
#     low = "low"
#     normal = "normal"
#     high = "high"


class Todo(BaseModel):
    id: str
    title: str
    completed: bool = False
    created_at: str
    # TODO(v2): priority: Priority = Priority.normal


class TodoCreate(BaseModel):
    title: str
    # TODO(v2): priority: Priority = Priority.normal  # omitted by old v1 clients


class TodoReplace(BaseModel):
    title: str
    completed: bool
    # TODO(v2): priority: Priority = Priority.normal


class TodoPatch(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None
    # TODO(v2): priority: Optional[Priority] = None


STORE: dict[str, dict] = {}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@app.get("/todos")
def list_todos(limit: int = Query(20, ge=1, le=100), cursor: Optional[str] = None):
    """Paginated list. Cursor is the last seen todo id (opaque)."""
    items = sorted(STORE.values(), key=lambda t: t["id"])
    if cursor:
        items = [t for t in items if t["id"] > cursor]
    page = items[:limit]
    next_cursor = page[-1]["id"] if len(items) > limit else None
    return {"items": page, "next_cursor": next_cursor}


@app.post("/todos", status_code=201)
def create_todo(body: TodoCreate):
    tid = str(uuid4())
    row = {
        "id": tid,
        "title": body.title,
        "completed": False,
        "created_at": _now(),
        # TODO(v2): store body.priority.value (default normal when client omits field)
    }
    STORE[tid] = row
    return row


@app.get("/todos/{todo_id}")
def get_todo(todo_id: str):
    row = STORE.get(todo_id)
    if not row:
        raise HTTPException(404, "todo not found")
    return row


@app.put("/todos/{todo_id}")
def replace_todo(todo_id: str, body: TodoReplace):
    if todo_id not in STORE:
        raise HTTPException(404, "todo not found")
    row = {
        "id": todo_id,
        "title": body.title,
        "completed": body.completed,
        "created_at": STORE[todo_id]["created_at"],
        # TODO(v2): include body.priority.value
    }
    STORE[todo_id] = row
    return row


@app.patch("/todos/{todo_id}")
def patch_todo(todo_id: str, body: TodoPatch):
    row = STORE.get(todo_id)
    if not row:
        raise HTTPException(404, "todo not found")
    data = body.model_dump(exclude_unset=True)
    # TODO(v2): if "priority" in data, write data["priority"].value (or .value if Enum)
    if "title" in data:
        row["title"] = data["title"]
    if "completed" in data:
        row["completed"] = data["completed"]
    return row


@app.delete("/todos/{todo_id}", status_code=204)
def delete_todo(todo_id: str):
    if todo_id not in STORE:
        raise HTTPException(404, "todo not found")
    del STORE[todo_id]
    return None
