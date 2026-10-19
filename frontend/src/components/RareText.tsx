import type { ReactNode } from 'react'
import { readingTokens } from '../readings'

/** Only the visible layer changes: source strings, form values and copied text stay intact. */
export function RareText({ children }: { children?: ReactNode }) {
  if (typeof children !== 'string') return <>{children}</>
  return <>{readingTokens(children).map((t, i) => t.reading ? (
    <ruby className="rare-reading" key={i} title={`${t.text}：${t.reading}（现代汉语字音；多音字列常见读音，不代表古音或通假释读）`} aria-label={`${t.text}，${t.reading}`}>
      {t.text}<rt data-reading={t.reading} aria-hidden="true" />
    </ruby>
  ) : t.text)}</>
}

/** SVG labels cannot contain HTML ruby. Keep a separate, code-point-aligned reading line. */
export function SvgRareText({ text, x, y, size }: { text: string; x: number; y: number; size: number }) {
  return <foreignObject x={x - 100} y={y - size * 1.2} width={200} height={size * 3}>
    <div style={{ textAlign: 'center', fontFamily: 'var(--serif)', fontSize: size, color: 'inherit', lineHeight: 2 }}><RareText>{text}</RareText></div>
  </foreignObject>
}
