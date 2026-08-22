-- Part A: full-text search ranked by BM25 relevance for body matching 'caching scaling'
SELECT title, author, views, SCORE() AS relevance
FROM   "ch2_articles"
WHERE  FALSE  -- implement: MATCH(body, 'caching scaling')
ORDER BY relevance DESC;

-- Part A: articles with views > 800 whose body matches 'database', ordered by views DESC
SELECT title, author, views
FROM   "ch2_articles"
WHERE  FALSE  -- implement: MATCH(body, 'database') AND views > 800
ORDER BY views DESC;

-- Part B: COUNT articles and SUM views per author, filtered to tag sql
SELECT author, COUNT(*) AS articles, SUM(views) AS total_views
FROM   "ch2_articles"
WHERE  FALSE  -- implement: tags = 'sql'
GROUP BY author
ORDER BY total_views DESC;
