// Small building blocks shared by every screen. Built on shadcn/ui primitives.
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/util'
import { DL } from '@/lib/dates'
import { TYPE_NAME } from '@/domain/constants'
import { pName, pShort, pHue, isX } from '@/domain/model'
import { PRODUCT_PHOTOS } from '@/generated/product-photos'

export const photoUrl = pid => (!isX(pid) && PRODUCT_PHOTOS.has(pid) ? `/products/${pid}.webp` : null)

// Product photo. Products without a photo get a tinted tile with the first letters of the short name.
export function ProductImage({ pid, size = 32, className }) {
  const url = photoUrl(pid)
  const name = pName(pid)
  if (url) {
    return (
      <span className={cn('pimg', className)} style={{ '--ps': size + 'px' }} title={name}>
        <img src={url} alt={name} loading="lazy" decoding="async" draggable={false} />
      </span>
    )
  }
  const short = pShort(pid); const big = size >= 56
  return (
    <span className={cn('pimg none', className)} style={{ '--ps': size + 'px', '--h': pHue(pid), fontSize: big ? Math.round(size * 0.19) : undefined }} title={name} role="img" aria-label={name}>
      {big ? short : short.slice(0, 3)}
    </span>
  )
}

// "[photo] ×4": the way products are shown everywhere on the route.
// name: 'auto' shows the short name only when there is no photo; 'short' / 'full' always show it.
// big: the route's large layout (photo on the left with the name under it, a large ×count beside it).
export function ProductQty({ pid, qty, type = 'regular', size = 34, name = 'auto', big = false, className }) {
  const hasPhoto = !!photoUrl(pid)
  const showName = name === 'short' || name === 'full' || (name === 'auto' && !hasPhoto)
  const label = `${pName(pid)} ${qty}개${type !== 'regular' ? ` (${TYPE_NAME[type]})` : ''}`
  if (big) {
    return (
      <span className={cn('pq big', type !== 'regular' && 't-' + type, className)} aria-label={label} title={label} style={{ '--ps': size + 'px' }}>
        <span className="ph">
          {type !== 'regular' && <span className="tag">{TYPE_NAME[type]}</span>}
          <ProductImage pid={pid} size={size} />
          {showName && <span className="n">{name === 'full' ? pName(pid) : pShort(pid)}</span>}
        </span>
        <span className="x num"><small>×</small>{qty}</span>
      </span>
    )
  }
  return (
    <span className={cn('pq', type !== 'regular' && 't-' + type, className)} aria-label={label} title={label}>
      {type === 'pickup' && <span className="tag">회수</span>}
      <ProductImage pid={pid} size={size} />
      {showName && <span className="n">{name === 'full' ? pName(pid) : pShort(pid)}</span>}
      <span className="x num"><small>×</small>{qty}</span>
    </span>
  )
}

export function Plate({ loc, sm = false }) {
  return (
    <span className={cn('plate', sm && 'sm')}>
      {loc?.building || '—'}{loc?.unit ? <><i>-</i>{loc.unit}</> : null}
    </span>
  )
}

export function Stepper({ value, onDec, onInc, label = '' }) {
  return (
    <span className="stepper">
      <button type="button" onClick={onDec} aria-label={`${label} 줄이기`.trim()}>−</button>
      <b>{value}</b>
      <button type="button" onClick={onInc} aria-label={`${label} 늘리기`.trim()}>+</button>
    </span>
  )
}

// Segmented control (one choice)
export function Seg({ value, onChange, options, className, itemClassName }) {
  return (
    <ToggleGroup
      type="single" value={value} spacing={0}
      onValueChange={v => { if (v) onChange(v) }}
      className={cn('flex w-full gap-[3px] rounded-[10px] bg-sunk p-[3px]', className)}
    >
      {options.map(([v, label]) => (
        <ToggleGroupItem
          key={v} value={v}
          className={cn(
            'h-auto min-h-0 flex-1 rounded-lg! border-0 px-2 py-[7px] text-[13.5px] font-semibold whitespace-nowrap text-mute hover:bg-transparent hover:text-ink pointer-coarse:py-2.5',
            'data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,.08)]',
            itemClassName,
          )}
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// Filter chip (on/off)
export function Chip({ pressed, onClick, children, count, className }) {
  return (
    <Toggle
      pressed={!!pressed}
      onPressedChange={() => onClick?.()}
      className={cn(
        'h-auto min-h-0 flex-none rounded-full border border-line bg-surface px-3 py-[5px] text-[13.5px] font-normal whitespace-nowrap hover:bg-sunk pointer-coarse:px-3.5 pointer-coarse:py-2',
        'data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-bg aria-pressed:bg-ink',
        className,
      )}
    >
      {children}
      {count != null && <b className="ml-1 font-semibold tabular-nums">{count}</b>}
    </Toggle>
  )
}

// Weekday picker (several days). value = [1,3,5]
export function DayPick({ value, onChange, days = [1, 2, 3, 4, 5, 6], className }) {
  return (
    <ToggleGroup
      type="multiple" spacing={1}
      value={value.map(String)}
      onValueChange={v => onChange(v.map(Number).sort())}
      className={cn('flex gap-1', className)}
    >
      {days.map(d => (
        <ToggleGroupItem
          key={d} value={String(d)} aria-label={DL[d] + '요일'}
          className={cn(
            'h-[30px] min-w-0 w-8 rounded-[7px]! border border-line bg-surface p-0 text-[13px] font-semibold text-mute hover:bg-sunk pointer-coarse:h-10 pointer-coarse:w-10',
            'data-[state=on]:border-brand data-[state=on]:bg-brand data-[state=on]:text-brand-ink',
          )}
        >
          {DL[d]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function Field({ label, htmlFor, children, className, hint }) {
  return (
    <div className={cn('field', className)}>
      {label != null && (htmlFor ? <label className="lbl" htmlFor={htmlFor}>{label}</label> : <span className="lbl">{label}</span>)}
      {children}
      {hint && <p className="hint" style={{ marginTop: 6 }}>{hint}</p>}
    </div>
  )
}

// A full-width checkbox row with a title and a small explanation
export function CheckRow({ checked, onChange, title, sub, className }) {
  return (
    <label className={cn('chk', className)}>
      <Checkbox checked={!!checked} onCheckedChange={v => onChange(!!v)} className="mt-0.5 size-[19px]" />
      <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
    </label>
  )
}

// Inline checkbox + text
export function CheckLine({ checked, onChange, children, className }) {
  return (
    <label className={cn('row cursor-pointer', className)} style={{ gap: 6 }}>
      <Checkbox checked={!!checked} onCheckedChange={v => onChange(!!v)} className="size-[18px]" />
      {children}
    </label>
  )
}

export function TypeBadge({ type, size, children }) {
  return <Badge variant={type} size={size}>{TYPE_NAME[type]}{children}</Badge>
}

export function EmptyCard({ title, children, className, style }) {
  return (
    <div className={cn('card empty', className)} style={style}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}

export function PDot({ pid, hue }) {
  return <span className="pdot" style={{ '--h': hue ?? pHue(pid) }} />
}
