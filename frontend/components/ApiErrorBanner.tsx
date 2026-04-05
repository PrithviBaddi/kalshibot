'use client'

type Props = {
  message: string
  /** Shown above the message */
  title?: string
  onDismiss?: () => void
}

/**
 * Consistent inline error for failed API calls (uses copy from formatApiError).
 */
export function ApiErrorBanner({ message, title = 'Something went wrong', onDismiss }: Props) {
  if (!message.trim()) return null
  return (
    <div
      style={{
        background: 'var(--red-bg)',
        border: '1px solid rgba(255,77,106,0.3)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 16,
        color: 'var(--red)',
        fontSize: 12,
        lineHeight: 1.45,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div>{message}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onDismiss}
          style={{ flexShrink: 0 }}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  )
}
