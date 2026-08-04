// LocationPrompt — a gentle, in-app way to set a distance origin. Deliberately
// does NOT fire the browser's geolocation permission dialog on its own; the OS
// prompt only appears after the user clicks "Use my location". A city picker is
// always offered as a no-permission fallback.
//
// Used both above the list (when "Nearest" sort is chosen) and atop the map.
'use client'

import { useState } from 'react'

export default function LocationPrompt({ cities, origin, onSetOrigin, onDismiss }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'locating' | 'error'
  const [error, setError] = useState('')

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      setError('This browser can’t share a location. Pick a city instead.')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      pos => {
        onSetOrigin({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'Your location',
        })
        setStatus('idle')
      },
      err => {
        setStatus('error')
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was blocked. Pick a city instead.'
            : 'Couldn’t get your location. Pick a city instead.'
        )
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    )
  }

  function pickCity(e) {
    const name = e.target.value
    if (!name) return
    const c = cities.find(c => c.name === name)
    if (c) onSetOrigin({ lat: c.lat, lng: c.lng, label: c.name })
  }

  // Already have an origin: show it compactly with a way to change/clear.
  if (origin) {
    return (
      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-line bg-brandSoft px-3 py-2 text-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-brand">
          <path d="M12 22s8-7.5 8-13a8 8 0 1 0-16 0c0 5.5 8 13 8 13z" /><circle cx="12" cy="9" r="3" />
        </svg>
        <span className="text-ink">
          Sorted by distance from <strong>{origin.label}</strong>
        </span>
        <button
          onClick={() => onSetOrigin(null)}
          className="ml-auto text-brand font-semibold hover:text-brandDark"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-ink">See opportunities near you</span>
        <button
          onClick={useMyLocation}
          disabled={status === 'locating'}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brandDark disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
          {status === 'locating' ? 'Locating…' : 'Use my location'}
        </button>

        <span className="text-sm text-muted">or</span>
        <label className="sr-only" htmlFor="city-origin">Pick a city</label>
        <select
          id="city-origin"
          defaultValue=""
          onChange={pickCity}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <option value="" disabled>Pick a city…</option>
          {cities.map(c => (
            <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
          ))}
        </select>

        {onDismiss && (
          <button onClick={onDismiss} className="ml-auto text-xs text-muted hover:text-ink">
            Not now
          </button>
        )}
      </div>
      {status === 'error' && <p className="mt-2 text-xs text-accent">{error}</p>}
    </div>
  )
}
