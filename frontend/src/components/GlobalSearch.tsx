import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchAll } from '../api'
import type { SearchHit } from '../types'
import Icon from './Icon'

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    const timer = window.setTimeout(() => {
      searchAll(q.trim())
        .then((res) => setHits(res.results))
        .catch(() => setHits([]))
    }, 220)
    return () => window.clearTimeout(timer)
  }, [q])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        box.current?.querySelector('input')?.focus()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="global-search" ref={box}>
      <Icon name="search" className="search-icon" />
      <input
        type="search"
        placeholder="Search cargo, clients, trucks…"
        value={q}
        aria-label="Global search"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
      />
      {open && q.trim().length >= 2 ? (
        <div className="search-panel">
          {hits.length === 0 ? <p className="muted">No matches.</p> : null}
          <ul>
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  className="ghost search-hit"
                  onClick={() => {
                    setOpen(false)
                    setQ('')
                    navigate(hit.to)
                  }}
                >
                  <em>{hit.kind}</em>
                  <strong>{hit.title}</strong>
                  <span>{hit.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
