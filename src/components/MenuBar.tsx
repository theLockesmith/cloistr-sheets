/**
 * MenuBar — a persistent, keyboard-accessible menu bar for Cloistr Sheets.
 *
 * ACCESSIBILITY CONTRACT
 * - role="menubar" on the bar, role="menu" on each dropdown, role="menuitem"
 *   on every item and trigger.
 * - aria-expanded on each trigger; aria-haspopup="true".
 * - Arrow keys (left/right) navigate between top-level menus.
 * - Arrow keys (up/down) navigate within an open menu.
 * - Enter/Space activates the focused item or opens a menu.
 * - Escape closes the open menu; focus returns to the trigger.
 * - Tab closes all menus and moves focus out of the menubar entirely.
 * - Clicks outside the bar close the open menu.
 *
 * MOBILE
 * - Below 640 px the menubar collapses into a single "Menu" button that opens
 *   a flat list of all items (as a bottom-anchored sheet). This avoids the
 *   unusable horizontal overflow that a full menu bar produces at 390 px.
 *
 * DISABLED ITEMS
 * - Items that have no implementation are disabled (aria-disabled="true") and
 *   show a "coming soon" tooltip rather than being absent. This keeps the
 *   structure learnable.
 *
 * KEYBOARD SHORTCUTS
 * - Displayed next to items that have them.
 * - The shortcuts are registered on the document so they work regardless of
 *   focus, but only when the Univer container has services (bridgeServices != null).
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { ActivePanel } from './Sheet.js'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MenuBarProps {
  hasServices: boolean
  onUndo: () => void
  onRedo: () => void
  onImportCSV: () => void
  onExportCSV: () => void
  onExportXLSX: () => void
  onSave: () => void
  onFreezeTopRow: () => void
  onUnfreeze: () => void
  onInsertRowBefore: () => void
  onInsertColBefore: () => void
  onToggleChart: () => void
  onToggleFormulaRef: () => void
  onToggleConditional: () => void
  onToggleSortFilter: () => void
  persistenceState: { dirty: boolean; saving: boolean; initialized: boolean }
  activePanel: ActivePanel
}

type ItemBase = {
  label: string
  shortcut?: string
  /** aria-label override when the label alone is not descriptive enough */
  ariaLabel?: string
}

type ActionItem = ItemBase & {
  type: 'item'
  action: () => void
  disabled?: boolean
  // exactOptionalPropertyTypes: allow explicit undefined alongside the absent case
  disabledReason?: string | undefined
}

type SeparatorItem = { type: 'separator' }

type MenuItem = ActionItem | SeparatorItem

interface MenuDef {
  id: string
  label: string
  items: MenuItem[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const BAR_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  height: 36,
  backgroundColor: 'var(--cloistr-bg)',
  borderBottom: '1px solid var(--cloistr-border)',
  flexShrink: 0,
  position: 'relative',
  zIndex: 200,
  userSelect: 'none',
}

const TRIGGER_STYLE = (open: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  padding: '0 0.625rem',
  fontSize: '0.8125rem',
  color: 'var(--cloistr-text)',
  background: open ? 'var(--cloistr-bg-hover)' : 'transparent',
  border: 'none',
  cursor: 'pointer',
  height: '100%',
  whiteSpace: 'nowrap',
  borderRadius: 0,
  outline: 'none',
})

const DROPDOWN_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  minWidth: 200,
  backgroundColor: 'var(--cloistr-bg)',
  border: '1px solid var(--cloistr-border)',
  borderRadius: '0 0 0.375rem 0.375rem',
  boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
  padding: '0.25rem 0',
  margin: 0,
  listStyle: 'none',
  zIndex: 201,
}

const ITEM_STYLE = (disabled: boolean, focused: boolean): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.375rem 0.875rem',
  fontSize: '0.8125rem',
  color: disabled ? 'var(--cloistr-text-muted)' : 'var(--cloistr-text)',
  backgroundColor: (!disabled && focused) ? 'var(--cloistr-bg-hover)' : 'transparent',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  minHeight: 32,
  gap: '2rem',
})

const SHORTCUT_STYLE: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--cloistr-text-muted)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const SEPARATOR_STYLE: React.CSSProperties = {
  height: 1,
  backgroundColor: 'var(--cloistr-border)',
  margin: '0.25rem 0',
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MenuBar({
  hasServices,
  onUndo,
  onRedo,
  onImportCSV,
  onExportCSV,
  onExportXLSX,
  onSave,
  onFreezeTopRow,
  onUnfreeze,
  onInsertRowBefore,
  onInsertColBefore,
  onToggleChart,
  onToggleFormulaRef,
  onToggleConditional,
  onToggleSortFilter,
  persistenceState,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [focusedItem, setFocusedItem] = useState<number>(-1)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])

  // Detect mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Build menu definitions inside the component so callbacks are up to date
  const menus = buildMenus({
    hasServices,
    onUndo,
    onRedo,
    onImportCSV,
    onExportCSV,
    onExportXLSX,
    onSave,
    onFreezeTopRow,
    onUnfreeze,
    onInsertRowBefore,
    onInsertColBefore,
    onToggleChart,
    onToggleFormulaRef,
    onToggleConditional,
    onToggleSortFilter,
    persistenceState,
    closeMenu: () => { setOpenMenu(null); setFocusedItem(-1) },
  })

  const openMenuItems = openMenu
    ? (menus.find((m) => m.id === openMenu)?.items ?? [])
    : []

  const selectableItems = openMenuItems.filter((i): i is ActionItem => i.type === 'item')

  // ── Close on outside click ─────────────────────────────────────────────
  useEffect(() => {
    if (!openMenu && !mobileOpen) return
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
        setFocusedItem(-1)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu, mobileOpen])

  // ── Global keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    if (!hasServices) return
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input / contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return

      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); onUndo() }
      if (ctrl && e.key === 'y') { e.preventDefault(); onRedo() }
      if (ctrl && e.shiftKey && e.key === 'Z') { e.preventDefault(); onRedo() }
      if (ctrl && e.key === 's') { e.preventDefault(); onSave() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [hasServices, onUndo, onRedo, onSave])

  // ── Menubar keyboard navigation ────────────────────────────────────────
  const openIndex = menus.findIndex((m) => m.id === openMenu)

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent, menuId: string) => {
    const idx = menus.findIndex((m) => m.id === menuId)
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIdx = (idx + 1) % menus.length
      const next = menus[nextIdx]
      if (!next) return
      setOpenMenu(next.id)
      setFocusedItem(-1)
      triggerRefs.current[nextIdx]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIdx = (idx - 1 + menus.length) % menus.length
      const prev = menus[prevIdx]
      if (!prev) return
      setOpenMenu(prev.id)
      setFocusedItem(-1)
      triggerRefs.current[prevIdx]?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpenMenu(menuId)
      setFocusedItem(0)
    } else if (e.key === 'Escape') {
      setOpenMenu(null)
      setFocusedItem(-1)
    } else if (e.key === 'Tab') {
      setOpenMenu(null)
      setFocusedItem(-1)
    }
  }, [menus])

  const handleItemKeyDown = useCallback((e: React.KeyboardEvent, item: ActionItem) => {
    const items = openMenuItems.filter((i): i is ActionItem => i.type === 'item')
    const idx = items.indexOf(item)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedItem((idx + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedItem((idx - 1 + items.length) % items.length)
    } else if (e.key === 'Escape') {
      setOpenMenu(null)
      setFocusedItem(-1)
      triggerRefs.current[openIndex]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!item.disabled) {
        item.action()
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIdx = (openIndex + 1) % menus.length
      const next = menus[nextIdx]
      if (!next) return
      setOpenMenu(next.id)
      setFocusedItem(0)
      triggerRefs.current[nextIdx]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIdx = (openIndex - 1 + menus.length) % menus.length
      const prev = menus[prevIdx]
      if (!prev) return
      setOpenMenu(prev.id)
      setFocusedItem(0)
      triggerRefs.current[prevIdx]?.focus()
    } else if (e.key === 'Tab') {
      setOpenMenu(null)
      setFocusedItem(-1)
    }
  }, [openMenuItems, openIndex, menus])

  // Focus the right item when focusedItem changes
  useEffect(() => {
    if (focusedItem >= 0 && focusedItem < itemRefs.current.length) {
      itemRefs.current[focusedItem]?.focus()
    }
  }, [focusedItem])

  // ── Mobile view ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div ref={barRef} style={{ ...BAR_STYLE, zIndex: 200 }}>
        {/* Single "Menu" button on mobile */}
        <button
          style={TRIGGER_STYLE(mobileOpen)}
          aria-expanded={mobileOpen}
          aria-haspopup="true"
          aria-label="Open menu"
          onClick={() => setMobileOpen((o) => !o)}
        >
          Menu
        </button>

        {mobileOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Sheet menu"
          >
            {/* Tap backdrop to close */}
            <div
              style={{ flex: 1 }}
              onClick={() => setMobileOpen(false)}
              role="button"
              aria-label="Close menu"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setMobileOpen(false) }}
            />
            <div
              style={{
                backgroundColor: 'var(--cloistr-bg)',
                borderRadius: '1rem 1rem 0 0',
                padding: '0.75rem 0 env(safe-area-inset-bottom, 0)',
                maxHeight: '70vh',
                overflowY: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                width: 48, height: 4, borderRadius: 2,
                backgroundColor: 'var(--cloistr-border)', margin: '0 auto 0.75rem',
              }} />
              {menus.flatMap((menu) => [
                <div key={`header-${menu.id}`} style={{
                  padding: '0.25rem 1rem 0.125rem',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  color: 'var(--cloistr-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginTop: '0.5rem',
                }}>
                  {menu.label}
                </div>,
                ...menu.items.map((item, i) => {
                  if (item.type === 'separator') return null
                  const it = item as ActionItem
                  return (
                    <button
                      key={`${menu.id}-${i}`}
                      disabled={it.disabled}
                      title={it.disabled && it.disabledReason ? it.disabledReason : undefined}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                        padding: '0.625rem 1rem',
                        fontSize: '0.9375rem',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        color: it.disabled ? 'var(--cloistr-text-muted)' : 'var(--cloistr-text)',
                        cursor: it.disabled ? 'not-allowed' : 'pointer',
                        opacity: it.disabled ? 0.55 : 1,
                        minHeight: 48,
                      }}
                      onClick={() => {
                        if (!it.disabled) {
                          it.action()
                          setMobileOpen(false)
                        }
                      }}
                    >
                      <span>{it.label}</span>
                      {it.shortcut && (
                        <span style={{ ...SHORTCUT_STYLE, fontSize: '0.8125rem' }}>{it.shortcut}</span>
                      )}
                    </button>
                  )
                }),
              ])}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Desktop menu bar ───────────────────────────────────────────────────
  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Spreadsheet menu"
      style={BAR_STYLE}
    >
      {menus.map((menu, menuIdx) => {
        const isOpen = openMenu === menu.id
        // Position the dropdown under its trigger
        return (
          <div key={menu.id} style={{ position: 'relative' }}>
            <button
              ref={(el) => { triggerRefs.current[menuIdx] = el }}
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={isOpen}
              style={TRIGGER_STYLE(isOpen)}
              onClick={() => {
                if (isOpen) {
                  setOpenMenu(null)
                  setFocusedItem(-1)
                } else {
                  setOpenMenu(menu.id)
                  setFocusedItem(-1)
                }
              }}
              onKeyDown={(e) => handleTriggerKeyDown(e, menu.id)}
              onMouseEnter={() => {
                // If another menu is already open, switch to this one on hover
                if (openMenu && openMenu !== menu.id) {
                  setOpenMenu(menu.id)
                  setFocusedItem(-1)
                }
              }}
            >
              {menu.label}
            </button>

            {isOpen && (
              <ul
                role="menu"
                aria-label={menu.label}
                style={DROPDOWN_STYLE}
              >
                {menu.items.map((item, itemIdx) => {
                  if (item.type === 'separator') {
                    return (
                      <li
                        key={`sep-${itemIdx}`}
                        role="separator"
                        style={SEPARATOR_STYLE}
                      />
                    )
                  }
                  const it = item as ActionItem
                  const selectableIdx = selectableItems.indexOf(it)
                  const isFocused = selectableIdx === focusedItem
                  return (
                    <li
                      key={`item-${itemIdx}`}
                      ref={(el) => { itemRefs.current[selectableIdx] = el }}
                      role="menuitem"
                      aria-label={it.ariaLabel ?? it.label}
                      aria-disabled={it.disabled ? 'true' : undefined}
                      tabIndex={isFocused ? 0 : -1}
                      title={it.disabled && it.disabledReason ? it.disabledReason : undefined}
                      style={ITEM_STYLE(!!it.disabled, isFocused)}
                      onMouseEnter={() => setFocusedItem(selectableIdx)}
                      onMouseLeave={() => setFocusedItem(-1)}
                      onClick={() => {
                        if (!it.disabled) {
                          it.action()
                          setOpenMenu(null)
                          setFocusedItem(-1)
                        }
                      }}
                      onKeyDown={(e) => handleItemKeyDown(e, it)}
                    >
                      <span>{it.label}</span>
                      {it.shortcut && (
                        <span style={SHORTCUT_STYLE}>{it.shortcut}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu structure
// ─────────────────────────────────────────────────────────────────────────────

function buildMenus(p: {
  hasServices: boolean
  onUndo: () => void
  onRedo: () => void
  onImportCSV: () => void
  onExportCSV: () => void
  onExportXLSX: () => void
  onSave: () => void
  onFreezeTopRow: () => void
  onUnfreeze: () => void
  onInsertRowBefore: () => void
  onInsertColBefore: () => void
  onToggleChart: () => void
  onToggleFormulaRef: () => void
  onToggleConditional: () => void
  onToggleSortFilter: () => void
  persistenceState: { dirty: boolean; saving: boolean; initialized: boolean }
  closeMenu: () => void
}): MenuDef[] {
  const { hasServices, persistenceState, closeMenu } = p

  const NEEDS_SHEET = 'Open a document first'

  function act(fn: () => void): () => void {
    return () => { closeMenu(); fn() }
  }

  return [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          type: 'item',
          label: 'Import CSV...',
          action: act(p.onImportCSV),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Export as CSV',
          action: act(p.onExportCSV),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        {
          type: 'item',
          label: 'Export as XLSX',
          action: act(p.onExportXLSX),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        { type: 'separator' },
        {
          type: 'item',
          label: persistenceState.saving ? 'Saving...' : 'Save',
          shortcut: 'Ctrl+S',
          action: act(p.onSave),
          disabled: !hasServices || !persistenceState.initialized || persistenceState.saving || !persistenceState.dirty,
          disabledReason: !hasServices ? NEEDS_SHEET : !persistenceState.dirty ? 'No unsaved changes' : undefined,
        },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        {
          type: 'item',
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: act(p.onUndo),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        {
          type: 'item',
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          action: act(p.onRedo),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Cut',
          shortcut: 'Ctrl+X',
          // Univer handles cut natively in the grid; the menu item is disabled
          // to avoid a double-action and to show users the shortcut.
          disabled: true,
          disabledReason: 'Use Ctrl+X in the grid',
          action: () => {},
        },
        {
          type: 'item',
          label: 'Copy',
          shortcut: 'Ctrl+C',
          disabled: true,
          disabledReason: 'Use Ctrl+C in the grid',
          action: () => {},
        },
        {
          type: 'item',
          label: 'Paste',
          shortcut: 'Ctrl+V',
          disabled: true,
          disabledReason: 'Use Ctrl+V in the grid',
          action: () => {},
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Find & Replace',
          shortcut: 'Ctrl+H',
          // Univer's built-in find/replace is triggered by Ctrl+H within the
          // grid (registered by sheets-ui). The menu entry shows the shortcut.
          disabled: true,
          disabledReason: 'Use Ctrl+H in the grid',
          action: () => {},
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          type: 'item',
          label: 'Freeze top row',
          action: act(p.onFreezeTopRow),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        {
          type: 'item',
          label: 'Unfreeze panes',
          action: act(p.onUnfreeze),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Gridlines',
          disabled: true,
          disabledReason: 'Coming soon',
          action: () => {},
        },
        {
          type: 'item',
          label: 'Zoom',
          disabled: true,
          disabledReason: 'Coming soon',
          action: () => {},
        },
      ],
    },
    {
      id: 'insert',
      label: 'Insert',
      items: [
        {
          type: 'item',
          label: 'Row above',
          action: act(p.onInsertRowBefore),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        {
          type: 'item',
          label: 'Column left',
          action: act(p.onInsertColBefore),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Chart...',
          action: act(p.onToggleChart),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Function reference...',
          action: act(p.onToggleFormulaRef),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
      ],
    },
    {
      id: 'format',
      label: 'Format',
      items: [
        {
          type: 'item',
          label: 'Conditional formatting...',
          action: act(p.onToggleConditional),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Number format',
          disabled: true,
          disabledReason: 'Coming soon',
          action: () => {},
        },
        {
          type: 'item',
          label: 'Cell alignment',
          disabled: true,
          disabledReason: 'Use the Univer toolbar',
          action: () => {},
        },
      ],
    },
    {
      id: 'data',
      label: 'Data',
      items: [
        {
          type: 'item',
          label: 'Sort & Filter...',
          action: act(p.onToggleSortFilter),
          disabled: !hasServices,
          disabledReason: !hasServices ? NEEDS_SHEET : undefined,
        },
      ],
    },
  ]
}
