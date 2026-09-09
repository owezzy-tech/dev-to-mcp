# DEV.to Content Automation Context

This context defines the language used when agents discover public Forem content and prepare controlled publishing work for an Author/Owner.

## Language

**Forem**:
The publishing platform that provides DEV.to content and identity data.

**Public Discovery**:
Read-only acquisition of public Forem Articles, Users, Tags, and Comments for agent use.
_Avoid_: Scraping, lookup API

**Article**:
Published content obtained from Forem.
_Avoid_: Post, document

**Article Snapshot**:
A stable normalized representation of an Article at the time it was observed.
_Avoid_: Raw Forem payload

**User**:
A public Forem identity that authors Articles and Comments.
_Avoid_: Account, profile

**Tag**:
A Forem classification associated with Articles.
_Avoid_: Category, label

**Comment**:
A public response attached to an Article.
_Avoid_: Reply, message

**Author/Owner**:
The human who owns publishing intent and grants Approval.
_Avoid_: Operator, agent

**Draft**:
Unpublished content represented by a specific version and content hash.
_Avoid_: Article, working copy

**Approval**:
An unexpired human authorization to publish one exact Draft version and content hash.
_Avoid_: Confirmation, review status

## Relationships

- **Public Discovery** produces **Article Snapshots** from **Forem**
- An **Article Snapshot** identifies one **User** and may contain **Tags** and **Comments**
- A **Draft** may be informed by one or more **Article Snapshots**
- An **Author/Owner** grants **Approval** for exactly one **Draft** version and content hash
- Editing an approved **Draft** invalidates its **Approval**

## Example dialogue

> **Dev:** "Can the agent publish the Draft after the Author/Owner edits it?"
> **Domain expert:** "No. The edit changes the Draft content hash, so the previous Approval is no longer valid."

## Flagged ambiguities

- "Article" previously risked referring to both published and unpublished content; use **Article** for published Forem content and **Draft** for unpublished content.
