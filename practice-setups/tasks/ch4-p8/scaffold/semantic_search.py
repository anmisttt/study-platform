import os

from qdrant_client import QdrantClient, models


COLLECTION = "study_notes"
MODEL_NAME = "BAAI/bge-small-en"
DOCUMENTS = [
    {"id": 1, "topic": "vector", "text": "Qdrant is a vector database for similarity search over embeddings."},
    {"id": 2, "topic": "analytics", "text": "Parquet stores analytical tables in a compressed columnar file format."},
    {"id": 3, "topic": "storage", "text": "RocksDB stores sorted key-value data in immutable SSTables."},
    {"id": 4, "topic": "text", "text": "Lucene indexes terms for ranked full-text retrieval and fuzzy matching."},
]


def connect() -> QdrantClient:
    client = QdrantClient(url=os.environ.get("QDRANT_URL", "http://localhost:6333"))
    client.set_model(
        MODEL_NAME,
        cache_dir=os.environ.get("FASTEMBED_CACHE_PATH", "/opt/fastembed_cache"),
        local_files_only=True,
    )
    return client


def reset_collection(client: QdrantClient) -> None:
    # TODO: recreate a cosine collection with the embedding model's vector size
    raise NotImplementedError


def index_documents(client: QdrantClient) -> None:
    # TODO: embed and upload DOCUMENTS with their text and topic payloads
    raise NotImplementedError


def semantic_search(
    client: QdrantClient, query: str, *, topic: str | None = None, limit: int = 3
) -> list[models.ScoredPoint]:
    # TODO: embed the query, apply the optional payload filter, and query Qdrant
    raise NotImplementedError
