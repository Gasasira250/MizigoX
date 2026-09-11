import { LIFECYCLE, lifecycleStep } from '../format'
import type { Load } from '../types'

export default function Lifecycle({ load }: { load: Load }) {
  const current = lifecycleStep(load)
  return (
    <ol className="lifecycle" aria-label="Shipment lifecycle">
      {LIFECYCLE.map((step, index) => (
        <li
          key={step.key}
          className={index < current ? 'done' : index === current ? 'current' : ''}
        >
          <span className="lifecycle-dot" />
          <span className="lifecycle-label">{step.label}</span>
        </li>
      ))}
    </ol>
  )
}
