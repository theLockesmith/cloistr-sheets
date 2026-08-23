/**
 * FormulaReferencePanel — an honest list of what the Univer formula engine
 * supports in this release.
 *
 * Univer 0.1.17 ships UniverFormulaEnginePlugin, which covers the functions
 * listed below.  This list was verified by grepping the engine-formula bundle
 * — see the implementation notes in Sheet.tsx.
 *
 * Anything NOT listed is not supported and will evaluate to #NAME? or be
 * silently ignored.  We do not claim parity with Excel or Google Sheets.
 */
export const SUPPORTED_FORMULAS: Array<{ category: string; functions: string[] }> = [
  {
    category: 'Math & Stats',
    functions: ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'ROUND', 'ABS', 'SQRT', 'POWER', 'MOD', 'INT'],
  },
  {
    category: 'Conditional',
    functions: ['IF', 'IFERROR', 'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS'],
  },
  {
    category: 'Lookup',
    functions: ['VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'OFFSET', 'INDIRECT', 'CHOOSE'],
  },
  {
    category: 'Text',
    functions: ['CONCATENATE', 'LEFT', 'RIGHT', 'MID', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'TEXT', 'VALUE'],
  },
  {
    category: 'Date & Time',
    functions: ['TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY'],
  },
  {
    category: 'Logical',
    functions: ['AND', 'OR', 'NOT'],
  },
  {
    category: 'Information',
    functions: ['ISBLANK', 'ISERROR'],
  },
]

interface FormulaReferencePanelProps {
  /** Called when the user dismisses the panel. */
  onClose: () => void
}

export function FormulaReferencePanel({ onClose }: FormulaReferencePanelProps) {
  return (
    <div
      role="dialog"
      aria-label="Supported formulas"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.35)',
        padding: '2rem 1rem',
        overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        backgroundColor: 'var(--cloistr-bg)',
        border: '1px solid var(--cloistr-border)',
        borderRadius: '0.5rem',
        padding: '1.25rem',
        maxWidth: '560px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--cloistr-text)' }}>
            Supported Formulas
          </h2>
          <button
            onClick={onClose}
            aria-label="Close formula reference"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: 'var(--cloistr-text-muted)',
              padding: '0.25rem 0.5rem',
              minHeight: 44,
              minWidth: 44,
              borderRadius: '0.25rem',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.8125rem', color: 'var(--cloistr-text-muted)', marginTop: 0 }}>
          Powered by Univer 0.1.17. Functions not listed here will evaluate to #NAME? or be
          silently ignored. This is not Excel or Google Sheets parity.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
          {SUPPORTED_FORMULAS.map(({ category, functions }) => (
            <div key={category}>
              <h3 style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--cloistr-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginTop: 0,
                marginBottom: '0.375rem',
              }}>
                {category}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {functions.map((fn) => (
                  <code
                    key={fn}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.125rem 0.375rem',
                      backgroundColor: 'var(--cloistr-bg-hover)',
                      border: '1px solid var(--cloistr-border)',
                      borderRadius: '0.25rem',
                      color: 'var(--cloistr-text)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {fn}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p style={{
          fontSize: '0.75rem',
          color: 'var(--cloistr-text-muted)',
          marginBottom: 0,
          marginTop: '1rem',
          borderTop: '1px solid var(--cloistr-border)',
          paddingTop: '0.75rem',
        }}>
          Tip: Enter a formula in any cell by typing <code>=</code> followed by the function name.
          Example: <code>=SUM(A1:A10)</code>
        </p>
      </div>
    </div>
  )
}
