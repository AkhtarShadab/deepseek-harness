/**
 * The delete action: a `sidebar.workspaces.session.menu.item` row that raises
 * the confirmation request, plus the `shell.overlay` dialog that confirms
 * permanent deletion. A running Session's plain delete is refused by the Host;
 * the dialog then offers Stop-and-delete, which stops the listed work first.
 * The notice for rejections lives in the injected callbacks, not here.
 */
import { useState } from 'react'
import type { SessionActivity } from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: the family keys each provider merges; a key this program did not compile takes the generic line.
import type {} from '@deepseek-ai/dsh-agent/types'
import type {} from '@deepseek-ai/dsh-jobs/view'
import type {} from '@deepseek-ai/dsh-schedule/client'
import type {} from '@deepseek-ai/dsh-subagent/client'
import { Button, IconTrashOutlineRegular, MenuItemButton, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DeleteSessionInjected, SessionDeleteConfirmInjected, SessionDeleteConfirmProps, SessionDeleteRequest,
  SessionMenuItemProps,
} from '../contract/slots.ts'
import { SessionDeleteError } from '../navigation.ts'
import browserCss from '../rows/WorkspaceBrowser.module.css'

/**
 * Menu row (order 420): ask for the permanent-delete confirmation for this row.
 * @param props - owner share, menu open state, and the delete share.
 * @returns the row.
 */
export function DeleteSessionMenuItem({
  sessionId, displayTitle, useMenuOpenState, requestSessionDelete, t,
}: SessionMenuItemProps<DeleteSessionInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      icon={<IconTrashOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        requestSessionDelete(sessionId, displayTitle)
      }}
    >
      {t('menu.deleteSession')}
    </MenuItemButton>
  )
}

/**
 * The `shell.overlay` entry: nothing while no delete is requested, otherwise
 * one dialog per request (keyed by the Session). Confirming deletes the row
 * permanently; an activity list turns the primary action into Stop-and-delete.
 * Cancelling leaves the Session untouched.
 * @param props - the request hook, its settlement, the delete hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionDeleteConfirmDialog({
  useDeleteRequest, settleSessionDelete, deleteSession, t,
}: SessionDeleteConfirmProps) {
  const request = useDeleteRequest(pending => pending)
  if (request === null) return null
  return <DeleteConfirmForm key={request.sessionId} request={request} deleteSession={deleteSession} onSettle={settleSessionDelete} t={t} />
}

/** One request's dialog: in-flight and error state die with it. */
function DeleteConfirmForm({ request, deleteSession, onSettle, t }: {
  request: SessionDeleteRequest
  deleteSession: SessionDeleteConfirmInjected['deleteSession']
  onSettle: () => void
  t: Omit<SessionDeleteConfirmProps, 'hooks'>['t']
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activity = request.activity
  const running = activity !== undefined && activity.length > 0
  const close = () => {
    if (deleting) return
    onSettle()
  }
  const confirm = () => {
    setDeleting(true)
    setError(null)
    deleteSession(request.sessionId, running ? { stopActivity: true } : {}).then(() => {
      setDeleting(false)
      onSettle()
    }).catch((reason: unknown) => {
      setDeleting(false)
      // A fresh refusal after a lost race replaces the stale list in place.
      // Class identity goes by name: client plugin bundles do not share it.
      if (reason instanceof Error && reason.name === 'SessionDeleteError') {
        const failure = (reason as SessionDeleteError).rpcError
        if (failure.code === 'session/delete-active') {
          const activity = (failure.details as { readonly activity?: readonly SessionActivity[] }).activity
          if (activity !== undefined) request.setActivity(activity)
        }
      }
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('delete.session.title')}
      description={t('delete.warning', { title: request.displayTitle })}
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={close}>{t('cancel')}</Button>
          <Button
            variant="primary"
            className={browserCss.deleteAction}
            disabled={deleting}
            onClick={confirm}
          >
            {t(running ? 'delete.stopAndDelete' : 'delete.confirm')}
          </Button>
        </>
      )}
    >
      {running && (
        <ul className={browserCss.archiveActivity} aria-label={t('archive.confirm.activity')}>
          {activity.map((entry, index) => (
            <li key={`${entry.kind}-${String(index)}`}>{activityLine(entry, t)}</li>
          ))}
        </ul>
      )}
      {deleting && <div className={browserCss.deleteStatus} role="status">{t('delete.session.pending')}</div>}
      {error !== null && <div className={browserCss.renameError} role="alert">{error}</div>}
    </Modal>
  )
}

/** One family's line, mirroring the archive-confirm dictionary entries. */
function activityLine(entry: SessionActivity, t: Omit<SessionDeleteConfirmProps, 'hooks'>['t']): string {
  const items = entry.items ?? []
  const n = items.length
  const names = items.map(item => item.label ?? item.id).join(t('archive.confirm.listSeparator'))
  const plural = n === 1 ? 'one' : 'other'
  switch (entry.kind) {
    case 'turn': return t('archive.confirm.turn')
    case 'subagent': return t(`archive.confirm.subagents.${plural}`, { n, names })
    case 'job': return t(`archive.confirm.jobs.${plural}`, { n, names })
    case 'schedule': return t(`archive.confirm.schedules.${plural}`, { n, names })
    default: return t(`archive.confirm.other.${plural}`, { kind: entry.kind, n })
  }
}
