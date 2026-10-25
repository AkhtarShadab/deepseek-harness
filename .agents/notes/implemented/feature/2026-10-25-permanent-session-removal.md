# Agent Note: Permanent session removal

Status: implemented

English | [中文](2026-10-25-permanent-session-removal.zh.md)

## Problem

Session storage had no reclamation path inside the harness. `WorkspaceRegistry.archiveSession` hides a Session's row while its JSONL directory under the persistence root stays on disk indefinitely, and the seam offered no deletion operation at all — pruning stored sessions was documented as out-of-band backend maintenance. A user who wanted a conversation gone for good could only delete files by hand while the Host kept write leases open, with no guarantee that registry membership, archive and pin sets, cached backend views, or another process's open handles stayed coherent. The product also needed one answer to "delete this session" that works from the Web sidebar through the Remote API down to any persistence backend, without silently discarding data the user believes is merely hidden.

## Decision

Deletion is a hard delete owned in layers, with the human as the only trigger.

- **The seam exposes `remove(id, { signal? })`.** It permanently removes one stored session's durable artifact and releases it from this backend's visibility: after success `stat` answers `undefined`, `list` omits the session, and `open` rejects as not found. An unknown id is not an error — other processes may already have removed it — so callers needing existence semantics check `stat` first. Removal refuses with `SessionAlreadyOwnedError` while this process holds an open handle; the caller disposes first, which keeps deletion from racing a live writer instead of defining merge semantics with one. Cross-process visibility follows each provider's freshness rule; the shipped JSONL backend's metadata reads refresh on the next `stat`/`list`.
- **The JSONL backend deletes the session directory outright.** Every retained generation goes with it, including the `session.lock` file that release deliberately leaves in place. Cached decodes and preparations for the id drop at once. An unmaterialized created session removes cleanly and leaves nothing behind. Another process's kernel lease does not block removal: the lock dies with its holder, and that holder's later operations report the session gone.
- **`WorkspaceRegistry.deleteSession(sessionId, { stopActivity? })` is archive's mirror minus reversibility.** It runs on the same serialized operation chain, applies the same existence check and `workspace/session-activity` waterfall refusal — unless `stopActivity` dispatches `workspace/session-stop` first — then disposes the live Agent, removes the log through `sessionPersistence.remove`, and drops the id from every workspace `sessionIds` list plus the archived and pinned sets. Its writes commit at the same chain slot so a concurrent attach cannot re-add the id after deletion.
- **Deletion never cascades.** Fork children and subagent descendants keep their own logs and their dangling `parentSession` header reference — display metadata lineage readers already tolerate, because externally removed directories produce the same state today. Cascade would mean one confirmed click silently destroying conversations the user never named.
- **One remote contract: `session.delete { sessionId, stopActivity? } -> { deleted: true }`, client surface `sessions.delete(...)`.** The controller resolves a cold Session, delegates admission and teardown to the registry, and registers the action under the `session` resource kind like the other addressed methods.
- **User-only authority, refusal as confirmation.** No agent tool performs deletion, mirroring the workspace-deletion policy that destructive filesystem actions stay separately named and explicitly confirmed. The sidebar registers `delete` into `sidebar.workspaces.session.menu.item` at order 420 — between Archive (400) and Copy Session ID (450) — with a dialog stating permanence. A running Session's refusal opens Stop-and-delete, reusing the stop-and-archive dialog shape: the Host names what will stop, Cancel leaves everything untouched, and Archive remains the advertised reversible choice when unsure.

## Alternatives considered

**Trash-directory soft delete with retention** — reclaiming nothing until a sweep, duplicating archive's job badly, and adding a second invisible lifecycle users must understand; archive already owns reversibility, and a delete that can be undone in-app invites exactly the ambiguity hard-delete resolves. Disk reclamation and product simplicity required the directory to go at confirmation.

**Cascade to fork children and subagent descendants** — lineage fields make descendants discoverable, but they are separate conversations the user did not select; deleting them together would surprise-destroy user data, and keeping them alive costs nothing because parent references degrade to display metadata. This mirrors the workspace rule that removing a registration never deletes its sessions.

**Implicit stop inside deleteSession** — deleting straight through running work saves a dialog but destroys an in-flight turn nobody asked to end, contradicting the archive precedent where the refusal itself is the confirmation and stopping happens only on explicit request. `stopActivity` keeps that choice user-visible.

**An agent-callable delete tool** — agents destroy session history they do not fully see; every other destructive control over stored user data (workspace removal, file deletion outside approved scopes) stays human-gated, and plugin practice requires human confirmation for irreversible actions.

**Deletion owned solely by the persistence backend** — the backend knows files, not registry membership, archive and pin sets, or live Agents; without the registry layer a deleted session would linger in durable workspace lists and sidebar projections as a phantom member.

## Consequences

A confirmed delete frees disk immediately and irreversibly: no undo path exists in the UI, API, or storage, so the dialog states permanence and docs steer uncertain users to archive. Deleted sessions leave dangling `parentSession` references in children, and `session-query`/export consumers must treat a missing parent as normal. Registry cleanup is atomic per chain slot, but the log removal and the registry write are two steps: a crash between them leaves either an orphan log directory (removed again by a retry) or an id listed without storage — the same divergence external deletion already produces, resolved by the existing membership filtering on read. Other processes see removal lazily through their next metadata read; nothing invalidates their caches eagerly. Backend implementers gain a sixth observable method that shared contract suites pin; a third-party provider without cheap deletion inherits the same refuse-while-open duty.
