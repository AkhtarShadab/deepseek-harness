/**
 * Session Controller delete delegation through the composed WorkspaceRegistry.
 * The registry owns activity refusal, stop ordering, durable-log removal, and
 * live disposal; this Remote maps its two expected failures onto typed codes
 * and forwards `stopActivity` verbatim. Ordinary removal reaches Clients as
 * `api-session/removed` once the Host Session store disposes the identity, so
 * the last case proves that relay fires for a deleted Session.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { SessionId as StoredSessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceActiveSessionError, WorkspaceUnknownSessionError } from '@deepseek-ai/dsh-workspace'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { createSessionTestRemote } from './test-remote.ts'

const sid = (id: string): StoredSessionId => id as StoredSessionId

/** Registry double whose deleteSession resolves; records every call's arguments. */
function registryDouble(deleteSession = vi.fn<(
  sessionId: StoredSessionId,
  options: { readonly stopActivity?: boolean },
) => Promise<void>>(() => Promise.resolve())): { deleteSession: typeof deleteSession } {
  return { deleteSession }
}

async function composed(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  return ctx
}

const remote = (ctx: Context) => createSessionTestRemote(ctx, {
  defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
  cwd: '/tmp',
})

describe('sessions.delete', () => {
  it('delegates the identity with an empty option set when stopActivity is omitted', async () => {
    const ctx = await composed()
    const registry = registryDouble()
    ctx.provide('workspaceRegistry', registry as never)
    const deleteSession = vi.spyOn(registry, 'deleteSession')

    const response = await remote(ctx).delete({ sessionId: sid('deleted-cold') })

    expect(response).toEqual({ ok: true, value: { deleted: true } })
    expect(deleteSession).toHaveBeenCalledExactlyOnceWith(sid('deleted-cold'), {})
  })

  it.for([undefined, false, true])('forwards stopActivity=%s exactly once', async (stopActivity) => {
    const ctx = await composed()
    const registry = registryDouble()
    ctx.provide('workspaceRegistry', registry as never)
    const deleteSession = vi.spyOn(registry, 'deleteSession')

    const response = await remote(ctx).delete({
      sessionId: sid('flag-passthrough'),
      ...(stopActivity === undefined ? {} : { stopActivity }),
    })

    expect(response.ok).toBe(true)
    if (stopActivity === true) {
      expect(deleteSession).toHaveBeenCalledExactlyOnceWith(sid('flag-passthrough'), { stopActivity: true })
    } else {
      expect(deleteSession).toHaveBeenCalledExactlyOnceWith(sid('flag-passthrough'), {})
    }
  })

  it('maps the registry definite miss to session/not-found with the addressed id', async () => {
    const ctx = await composed()
    const missing = new WorkspaceUnknownSessionError(sid('gone'), 'delete')
    ctx.provide('workspaceRegistry', registryDouble(
      vi.fn(() => Promise.reject(missing)),
    ) as never)

    const response = await remote(ctx).delete({ sessionId: sid('gone') })

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error).toMatchObject({
        code: 'session/not-found',
        details: { sessionId: sid('gone') },
        cause: missing,
      })
      expect(response.error.message).toContain("cannot delete session 'gone'")
    }
  })

  it('maps the active refusal to session/delete-active carrying the reported activity', async () => {
    const ctx = await composed()
    const activity = [{ kind: 'turn' }] as unknown as readonly SessionActivity[]
    const refused = new WorkspaceActiveSessionError(sid('busy'), activity)
    ctx.provide('workspaceRegistry', registryDouble(
      vi.fn(() => Promise.reject(refused)),
    ) as never)

    const response = await remote(ctx).delete({ sessionId: sid('busy') })

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error).toMatchObject({
        code: 'session/delete-active',
        details: { sessionId: sid('busy'), activity },
        cause: refused,
      })
    }
  })

  it('propagates an unexpected registry fault into the carrier internal fold', async () => {
    const ctx = await composed()
    ctx.provide('workspaceRegistry', registryDouble(
      vi.fn(() => Promise.reject(new Error('storage offline'))),
    ) as never)

    const response = await remote(ctx).delete({ sessionId: sid('unclassified') })

    expect(response).toMatchObject({
      ok: false,
      error: { code: 'gateway/internal', message: 'storage offline' },
    })
  })
})
