# N3-N4 Practice JSON Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one import-ready JSON file with 200 non-duplicate JLPT N3-N4 practice questions derived from the supplied notes.

**Architecture:** Use the project's built-in exam format. Store 120 standalone questions in `questions` and 80 reading questions as 20 `readingPassages` plus 80 `reading_comp` children. A local validation script checks counts, schema fields, answer ranges, sorting orders, reading linkage, and exact duplicate stems.

**Tech Stack:** JSON, Python 3, project parser contract.

---

### Task 1: Author the item bank

**Files:**
- Create: `src/data/bank/n3_n4_notes_practice_200.json`

- [ ] Create 40 vocabulary, 60 grammar, and 20 sorting items using the observed raw types and 0-based answers.
- [ ] Create 20 reading passages with four linked `reading_comp` children each.
- [ ] Set the section counts to 40, 60, 20, and 80 respectively.

### Task 2: Validate the import artifact

**Files:**
- Create: `scripts/validate_n3_n4_notes_practice_200.py`

- [ ] Verify the JSON parses, has exactly 200 questions, preserves the requested category counts, and has four options per choice item.
- [ ] Verify every answer index and every sorting order index is valid, and that each reading child links to an existing passage.
- [ ] Reject duplicate question text and duplicate reading passages.

### Task 3: Run import compatibility checks

- [ ] Run `python scripts/validate_n3_n4_notes_practice_200.py` and require a zero exit code.
- [ ] Load the JSON through the project parser and confirm 120 standalone questions, 20 reading groups, and 200 total visible questions.
