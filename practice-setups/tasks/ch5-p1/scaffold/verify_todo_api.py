#!/usr/bin/env python3
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen


BASE_URL = "http://127.0.0.1:8000"
LEGACY_TODO_ID = "legacy-todo"


def request(method: str, path: str, payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = Request(
        BASE_URL + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        response = urlopen(req)
    except HTTPError as error:
        response = error
    body = response.read()
    return response.status, json.loads(body) if body else None


status, schema = request("GET", "/openapi.json")
assert status == 200
assert schema["info"]["version"] == "2.0.0"
assert "priority" in schema["components"]["schemas"]["Todo"]["properties"]
todo_ref = "#/components/schemas/Todo"
for path, method, success_status in (
    ("/todos", "post", "201"),
    ("/todos/{todo_id}", "get", "200"),
    ("/todos/{todo_id}", "put", "200"),
    ("/todos/{todo_id}", "patch", "200"),
):
    response_schema = schema["paths"][path][method]["responses"][success_status][
        "content"
    ]["application/json"]["schema"]
    assert response_schema["$ref"] == todo_ref

status, old_client_todo = request("POST", "/todos", {"title": "buy milk"})
assert status == 201
assert old_client_todo["priority"] == "normal"

status, v2_todo = request(
    "POST", "/todos", {"title": "pay rent", "priority": "high"}
)
assert status == 201
assert v2_todo["priority"] == "high"

status, page = request("GET", "/todos")
assert status == 200
priorities = {todo["id"]: todo["priority"] for todo in page["items"]}
assert priorities[LEGACY_TODO_ID] == "normal"
assert priorities[old_client_todo["id"]] == "normal"
assert priorities[v2_todo["id"]] == "high"

status, fetched = request("GET", f"/todos/{v2_todo['id']}")
assert status == 200
assert fetched["priority"] == "high"

status, legacy_todo = request("GET", f"/todos/{LEGACY_TODO_ID}")
assert status == 200
assert legacy_todo["priority"] == "normal"

status, patched = request(
    "PATCH", f"/todos/{old_client_todo['id']}", {"priority": "low"}
)
assert status == 200
assert patched["title"] == "buy milk"
assert patched["completed"] is False
assert patched["priority"] == "low"

status, patched = request(
    "PATCH", f"/todos/{old_client_todo['id']}", {"priority": None}
)
assert status == 200
assert patched["priority"] == "low"

status, patched = request(
    "PATCH",
    f"/todos/{old_client_todo['id']}",
    {"title": "buy oat milk", "completed": True},
)
assert status == 200
assert patched["title"] == "buy oat milk"
assert patched["completed"] is True
assert patched["priority"] == "low"

status, replaced = request(
    "PUT",
    f"/todos/{v2_todo['id']}",
    {"title": "pay rent today", "completed": True},
)
assert status == 200
assert replaced["priority"] == "normal"

status, _ = request("POST", "/todos", {"title": "invalid", "priority": "urgent"})
assert status == 422

print("verification passed")
