from semantic_search import (
    COLLECTION,
    connect,
    index_documents,
    reset_collection,
    semantic_search,
)


client = connect()
reset_collection(client)
index_documents(client)

info = client.get_collection(COLLECTION)
assert info.points_count == 4

vector_hits = semantic_search(client, "database for similarity search")
assert vector_hits[0].payload["topic"] == "vector"
assert all(left.score >= right.score for left, right in zip(vector_hits, vector_hits[1:]))

filtered_hits = semantic_search(client, "search with spelling mistakes", topic="text")
assert filtered_hits
assert all(hit.payload["topic"] == "text" for hit in filtered_hits)

print("PASS: embeddings were stored and queried through a running Qdrant server")
