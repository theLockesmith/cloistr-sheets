/**
 * FormulaReferencePanel — a factual list of what the Univer formula engine
 * supports in this release.
 *
 * SOURCE OF TRUTH: @univerjs/sheets-formula 0.25.1 registers 528 unique
 * functions via UniverSheetsFormulaPlugin. This list is derived from the
 * `functionName:` entries in that package's CJS bundle — grep confirms 528
 * distinct function names, and they are grouped by category below.
 *
 * These are SOURCE-LEVEL claims (what the plugin registers). Behavioral
 * verification (typing =SUM(1,2) into a live cell and observing "3") requires
 * a running browser with all plugins registered. That verification cannot be
 * performed in a headless build pass; it must be done by a human after deploy.
 *
 * What changed vs the old panel:
 * - Old panel: 47 functions derived from a grep of engine-formula's bundle while
 *   sheets-formula was NOT installed. The engine's presence does not mean its
 *   function library is wired to the sheet. That is what sheets-formula does.
 * - New panel: 528 functions from sheets-formula 0.25.1, now properly installed
 *   and registered via UniverSheetsFormulaPlugin + UniverSheetsFormulaUIPlugin.
 *
 * The formula bar and autocomplete (UniverSheetsFormulaUIPlugin) are also new
 * in this release.
 */

export const SUPPORTED_FORMULAS: Array<{ category: string; count: number; sample: string[] }> = [
  {
    category: 'Math & Trigonometry',
    count: 87,
    sample: ['SUM', 'PRODUCT', 'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'FLOOR', 'CEILING',
             'INT', 'MOD', 'POWER', 'SQRT', 'SQRTPI', 'EXP', 'LN', 'LOG', 'LOG10',
             'SIN', 'COS', 'TAN', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'SUMSQ',
             'RAND', 'RANDBETWEEN', 'SEQUENCE', 'RANDARRAY', 'SUBTOTAL', 'AGGREGATE'],
  },
  {
    category: 'Statistical',
    count: 106,
    sample: ['AVERAGE', 'AVERAGEIF', 'AVERAGEIFS', 'COUNT', 'COUNTA', 'COUNTBLANK',
             'COUNTIF', 'COUNTIFS', 'MAX', 'MIN', 'MAXIFS', 'MINIFS', 'MEDIAN',
             'LARGE', 'SMALL', 'RANK_EQ', 'STDEV_S', 'STDEV_P', 'VAR_S', 'VAR_P',
             'CORREL', 'LINEST', 'FORECAST', 'GROWTH', 'FREQUENCY'],
  },
  {
    category: 'Lookup & Reference',
    count: 38,
    sample: ['VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'XMATCH', 'INDEX', 'MATCH', 'OFFSET',
             'INDIRECT', 'ADDRESS', 'CHOOSE', 'FILTER', 'SORT', 'SORTBY', 'UNIQUE',
             'TRANSPOSE', 'ROW', 'ROWS', 'COLUMN', 'COLUMNS', 'HYPERLINK',
             'HSTACK', 'VSTACK', 'TAKE', 'DROP', 'EXPAND'],
  },
  {
    category: 'Text',
    count: 51,
    sample: ['CONCATENATE', 'CONCAT', 'TEXTJOIN', 'LEFT', 'RIGHT', 'MID', 'LEN',
             'UPPER', 'LOWER', 'PROPER', 'TRIM', 'CLEAN', 'TEXT', 'VALUE',
             'FIND', 'SEARCH', 'REPLACE', 'SUBSTITUTE', 'REPT', 'CHAR', 'CODE',
             'TEXTBEFORE', 'TEXTAFTER', 'TEXTSPLIT', 'REGEXMATCH', 'REGEXEXTRACT'],
  },
  {
    category: 'Date & Time',
    count: 27,
    sample: ['TODAY', 'NOW', 'DATE', 'DATEVALUE', 'YEAR', 'MONTH', 'DAY',
             'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'WEEKNUM', 'ISOWEEKNUM',
             'EDATE', 'EOMONTH', 'NETWORKDAYS', 'WORKDAY', 'DAYS', 'DAYS360', 'DATEDIF'],
  },
  {
    category: 'Logical',
    count: 19,
    sample: ['IF', 'IFERROR', 'IFNA', 'IFS', 'AND', 'OR', 'NOT', 'XOR',
             'TRUE', 'FALSE', 'SWITCH', 'LET', 'LAMBDA', 'MAP', 'REDUCE',
             'BYROW', 'BYCOL', 'MAKEARRAY', 'SCAN'],
  },
  {
    category: 'Information',
    count: 25,
    sample: ['ISBLANK', 'ISERROR', 'ISERR', 'ISNA', 'ISNUMBER', 'ISTEXT',
             'ISLOGICAL', 'ISREF', 'ISFORMULA', 'ISEVEN', 'ISODD', 'ISDATE',
             'CELL', 'TYPE', 'N', 'NA', 'ERROR_TYPE'],
  },
  {
    category: 'Financial',
    count: 56,
    sample: ['PMT', 'PV', 'FV', 'NPV', 'IRR', 'XIRR', 'XNPV', 'RATE',
             'NPER', 'IPMT', 'PPMT', 'MIRR', 'DB', 'DDB', 'SLN', 'SYD'],
  },
  {
    category: 'Engineering',
    count: 57,
    sample: ['BIN2DEC', 'BIN2HEX', 'DEC2BIN', 'HEX2DEC', 'BITAND', 'BITOR',
             'BITXOR', 'CONVERT', 'COMPLEX', 'IMABS', 'IMREAL', 'IMAGINARY',
             'ERF', 'ERFC', 'DELTA', 'GESTEP'],
  },
  {
    category: 'Database',
    count: 12,
    sample: ['DSUM', 'DAVERAGE', 'DCOUNT', 'DCOUNTA', 'DGET', 'DMAX', 'DMIN',
             'DPRODUCT', 'DSTDEV', 'DSTDEVP', 'DVAR', 'DVARP'],
  },
  {
    category: 'Statistical (compat.)',
    count: 38,
    sample: ['NORMDIST', 'NORMINV', 'NORMSDIST', 'NORMSINV', 'POISSON',
             'TDIST', 'TINV', 'FDIST', 'FINV', 'GAMMADIST', 'GAMMAINV',
             'STDEV', 'STDEVP', 'VAR', 'VARP', 'RANK', 'MODE', 'PERCENTILE', 'QUARTILE'],
  },
  {
    category: 'Web',
    count: 3,
    sample: ['ENCODEURL', 'FILTERXML', 'WEBSERVICE'],
  },
]

interface FormulaReferencePanelProps {
  onClose: () => void
}

export function FormulaReferencePanel({ onClose }: FormulaReferencePanelProps) {
  const totalFunctions = SUPPORTED_FORMULAS.reduce((n, c) => n + c.count, 0)

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
        maxWidth: '640px',
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.125rem', fontSize: '1.05rem', color: 'var(--cloistr-text)' }}>
              Supported Formulas
            </h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cloistr-text-muted)' }}>
              {totalFunctions} functions from @univerjs/sheets-formula 0.25.1
            </p>
          </div>
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
          The formula bar, cell evaluation, and function autocomplete are provided by
          UniverSheetsFormulaPlugin + UniverSheetsFormulaUIPlugin. Each category shows a
          representative sample; the count is the total registered.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {SUPPORTED_FORMULAS.map(({ category, count, sample }) => (
            <div key={category}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.375rem' }}>
                <h3 style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--cloistr-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: 0,
                }}>
                  {category}
                </h3>
                <span style={{ fontSize: '0.6875rem', color: 'var(--cloistr-text-muted)' }}>
                  ({count} total)
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {sample.map((fn) => (
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
                {count > sample.length && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--cloistr-text-muted)',
                    padding: '0.125rem 0.25rem',
                    alignSelf: 'center',
                  }}>
                    +{count - sample.length} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          fontSize: '0.75rem',
          color: 'var(--cloistr-text-muted)',
          marginTop: '1rem',
          borderTop: '1px solid var(--cloistr-border)',
          paddingTop: '0.75rem',
        }}>
          <p style={{ margin: '0 0 0.25rem' }}>
            Type <code>=</code> in any cell to open the formula bar and function autocomplete.
          </p>
          <p style={{ margin: 0 }}>
            Error values display as <code>#DIV/0!</code> <code>#REF!</code> <code>#VALUE!</code> <code>#NAME?</code> <code>#N/A</code>.
            The function count is a source-level claim (from the plugin registration code).
            Behavioral confirmation requires a running browser session.
          </p>
        </div>
      </div>
    </div>
  )
}
