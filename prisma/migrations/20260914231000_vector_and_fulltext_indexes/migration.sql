CREATE INDEX IF NOT EXISTS "embeddings_vector_hnsw_idx"
    ON "embeddings" USING hnsw ("vector" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "article_snapshots_search_text_idx"
    ON "article_snapshots" USING gin (
        to_tsvector(
            'english',
            coalesce("title", '') || ' ' || coalesce("description", '')
        )
    );
