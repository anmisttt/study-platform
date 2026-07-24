---
name: chapter-study-json
description: Generate self-contained chapter study JSON (theory + practice) from Designing Data-Intensive Applications or similar technical books. Use when the user asks to create study material for a chapter, generate a chapter JSON, do the same for chapter N, or produce first_chapter.json / second_chapter.json style files.
---

# Chapter Study JSON Generator

Create study material JSON for one book chapter. Follow these instructions exactly. Match tone and density of existing `*_chapter.json` files in the repo root.

## Workflow

1. Identify the book file and target chapter (e.g. `do the same for chapter 2`).
2. Read **only** the requested chapter. If page extraction looks malformed, re-check page order before writing output.
3. Draft ~10–15 theory items and 1–5 practice items (unless the user asks otherwise).
4. Save as `<chapter_name>.json` or the filename the user requested (repo convention: `first_chapter.json`, `ninth_chapter.json`, …).
5. Validate: JSON parses; `quality` is only `bad` | `good` | `perfect`; run lints/diagnostics on the file when available.

## Output structure

Valid JSON with chapter `number`, exact chapter title in `name`, plus `theory` and `practice`:

```json
{
  "number": 1,
  "name": "name of the chapter",
  "theory": [
    {
      "question": "Short practice task, no question mark.",
      "answer": "Headline answer in 1-3 sentences — the first thing you'd say when summarizing the topic.\n\n\"Short author quote.\"\n\nDeep dive with enough context to answer without reopening the book.\n\nComment: brief real-world note or proof link."
    }
  ],
  "practice": [{
    "task": "[Database] short practical task",
    "description": "Setup script plus context needed to solve the task without reopening the book.",
    "solutions": [
      {
        "quality": "bad|good|perfect",
        "solution": "Solution and why it has this quality."
      }
    ]
  }]
}
```

## Theory questions

- Open-ended but concrete; prefer day-to-day software engineering over abstract, philosophical, or historical questions.
- Avoid vague academic jargon in the question. Lead with a concrete scenario, then optionally name the term. Prefer "You have a User object with nested job and education lists; what problems appear when storing it in relational tables?" over "Explain object-relational impedance mismatch."
- Put concrete examples in the question when choosing a model, tradeoff, database, or query style.
- Write questions as short practice tasks, not full sentences when possible.
- Never reference book structure: no `this chapter`, `the chapter`, `Chapter N`, `as discussed in Chapter N`.
- Self-contained for readers who have not read the book: define terms, scenarios, and enough context without the source.
- Outside direct author quotes, do not write `from the book`, `in the book`, or `the book says` — use plain technical explanation.
- Group related topics into one item. Convert theory into practice when doing something concrete teaches better (queries, migrations, modeling, tradeoffs).
- Aim for ~10–15 focused theory items unless asked otherwise.

## Answers

- Audience: software engineer preparing for SWE / system-design interviews. Write like a senior engineer explaining to a peer — neutral, technical, depth-first. Do not pepper answers with "interview" or "interviewer".
- Every answer must include at least one short author/book quote. Each `answer` is a string.
- Structure: headline (1–3 sentences) → quote → deep dive → optional `Comment:`.
- Usually 150–400 words; longer when covering several sub-concepts.
- Use `\n\n` between sections; use `\n` inside sections where it helps (label, data shape, query, conclusion).
- Comparisons: define the difference before pros/cons/examples. If the question lists examples, analyze each and name the recommended choice.
- No coaching phrases ("what an interviewer wants", "don't sound naive", "show you've shipped this").
- Optional `Comment:` with a real-world tie-in and proof/source link when adding external knowledge.

## Practice block

- Include when the chapter supports a concrete architecture or design exercise.
- Prefer original scenarios unless the user asks to stay close to the book.
- Prefer databases runnable in a GUI (e.g. DBeaver): PostgreSQL (relational/JSONB), Elasticsearch (document/search), OrientDB (graph). Prefix DB tasks: `[PostgreSQL]`, `[Elasticsearch]`, `[OrientDB]`.
- Wrap coding blocks as ```` ```\n{content}\n``` ````.
- Aim for ~1–5 practice items unless asked otherwise.
- Follow [styleguide](../validate-practice-tasks/STYLEGUIDE.md)

## General rules

- Write for readers who may not have read the book. Every question and answer
  must stand alone: explain the scenario, data flow,
  and technical reasoning directly instead of pointing to book chapters, page numbers,
  or figures.
- Don't include images or references to book structure (the user doesn't see
  them). This includes figure numbers — never write `Figure 6-11`, `see Figure 3`,
  `Chapter 9`, `as discussed in Chapter 3`, or similar. Explain the idea in words
  instead: describe the scenario, data flow, or before/after state so the reader can
  follow without opening the book.
- Author quotes are fine and encouraged, but surround them with enough explanation
  that the quote is understandable on its own.
- Wrap coding blocks into ```\n{content}\n```.

## Validation checklist

- [ ] JSON parses
- [ ] `number` and exact `name` set
- [ ] Theory answers include a quote and are roughly 150–400 words when applicable
- [ ] No book-structure / figure references
- [ ] Lints/diagnostics clean when available

