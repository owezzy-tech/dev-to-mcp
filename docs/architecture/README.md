# Architecture Artifacts

This catalog connects the project architecture narrative to interactive, evidence-backed Archify diagrams. Each diagram is delivered as a standalone HTML viewer with theme switching, guided views, search, relationship tracing, pan and zoom, presentation mode, and export controls.

## Project architecture

**Purpose**: Show the implemented read-only MCP runtime beside the planned publishing platform without presenting deferred Modules as live behavior.

- Interactive viewer: [`project-architecture.html`](project-architecture.html)
- Frozen specification: [`project-architecture.archify.json`](project-architecture.archify.json)
- Visual review contact sheet: [`project-architecture.visual-check.html`](project-architecture.visual-check.html)
- Visual-check receipt: [`project-architecture.visual-check.json`](project-architecture.visual-check.json)
- Scope: current runtime and target architecture
- Diagram type: architecture
- Specification SHA-256: `fb266209f148de281c40d07faff58459cd4d82a94d7a8a63528280a791ec99ca`
- Artifact SHA-256: `a8843476f90ac1268fade86d075189b70411eaef4ed428f125017da692b641c4`

## Current MCP request sequence

**Purpose**: Trace the implemented initialization, session routing, read-tool invocation, public Forem request, and MCP text-result response.

- Interactive viewer: [`mcp-request-sequence.html`](mcp-request-sequence.html)
- Frozen specification: [`mcp-request-sequence.archify.json`](mcp-request-sequence.archify.json)
- Superseded v1 specification: [`mcp-request-sequence.v1.archify.json`](mcp-request-sequence.v1.archify.json)
- Visual review contact sheet: [`mcp-request-sequence.visual-check.html`](mcp-request-sequence.visual-check.html)
- Visual-check receipt: [`mcp-request-sequence.visual-check.json`](mcp-request-sequence.visual-check.json)
- Scope: current implementation
- Diagram type: sequence
- Specification SHA-256: `f9c13fd452d11692a342ce22f880f1e51aa73049b0cc2ab314d51ad1444f5688`
- Artifact SHA-256: `d4ce38de41812616ff2361cda9b78d32eaf2ac2fc6c5c4b88559ddcccd8c3226`

## Approval-aware Draft lifecycle

**Purpose**: Define the planned Draft workflow, including the exact version-and-content-hash Approval gate, rejection and revision, edit invalidation, publication retry, and explicit no-publish outcome.

- Interactive viewer: [`draft-lifecycle.html`](draft-lifecycle.html)
- Frozen specification: [`draft-lifecycle.archify.json`](draft-lifecycle.archify.json)
- Superseded v1 specification: [`draft-lifecycle.v1.archify.json`](draft-lifecycle.v1.archify.json)
- Visual review contact sheet: [`draft-lifecycle.visual-check.html`](draft-lifecycle.visual-check.html)
- Visual-check receipt: [`draft-lifecycle.visual-check.json`](draft-lifecycle.visual-check.json)
- Scope: planned workflow contract
- Diagram type: lifecycle
- Specification SHA-256: `4ff4ecdee320d4c9774efab4d206324e57196a1b1562b710f5e7bb8a001bc138`
- Artifact SHA-256: `693f7627188701aa53ee94b2b11e27d952cb0384f9b4599a9b3fac8249bea99e`

## Quality status

- All three frozen specifications pass the Archify showcase profile.
- Each delivery passes all 9 structural and composition checks with zero errors and zero warnings.
- Light and dark theme captures are stored beside each viewer at 1440×900 and 2048×1320.
- Presentation mode is the first-screen containment surface. Read mode intentionally continues below the fold to show supporting cards.
- Presentation mode has no horizontal or vertical overflow at 1440×900, 1600×1000, 1920×1080, or 2048×1320 for any diagram.

## Source evidence

The diagrams were derived from:

- [Architecture baseline](../reference/architecture-baseline.md)
- [Implementation plan](../explanation/implementation-plan.md)
- [Software requirements](../requirements/DEVto_Agent_Publishing_Platform_SRS.docx)
- [Domain language](../explanation/domain-language.md)
- Current runtime source under [`../../src/`](../../src/)
- Characterization tests and tool-contract fixtures under [`../../test/`](../../test/)

The JSON specifications were frozen when their corresponding HTML deliveries succeeded. Update architecture by authoring and validating a new specification revision rather than editing a delivered specification in place.
