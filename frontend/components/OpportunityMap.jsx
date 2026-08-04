// OpportunityMap — a clustered map of located opportunities (Airbnb-style:
// zoomed-out region bubbles that break apart into individual pins as you zoom).
//
// Built imperatively on plain Leaflet + leaflet.markercluster rather than
// react-leaflet, to avoid the React-version coupling (react-leaflet 5 needs
// React 19; this app is on 18) and to keep full control of the cluster styling.
// Loaded only via next/dynamic({ ssr: false }) — Leaflet touches `window` at
// import, so it must never run on the server.
//
// Positions are CITY-LEVEL (see geocode_listings.py). To keep same-city
// listings from collapsing onto one unusable point, each pin gets a small,
// deterministic jitter around its city centroid — enough to declump into a
// readable cloud, small enough to still read as "around this city," never a
// claim of a precise street location.
'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { geoCoords } from '../lib/city'

const BRAND = '#4f46e5'
const ACCENT = '#ea580c'
const DFW_CENTER = [32.85, -96.95]
const JITTER = 0.02 // ~1.4 mi max offset around a city centroid

// Stable pseudo-random in [-1, 1] from a string (so a listing sits in the same
// spot on every render instead of jumping around).
function seededOffset(str, salt) {
  let h = 2166136261
  const s = str + salt
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967295) * 2 - 1
}

function pinIcon() {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;
      background:${BRAND};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function originIcon() {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:20px;height:20px;border-radius:50%;
      background:${ACCENT};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5)"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function clusterIcon(cluster) {
  const n = cluster.getChildCount()
  const size = n < 10 ? 34 : n < 50 ? 42 : n < 200 ? 52 : 62
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;
      justify-content:center;border-radius:50%;background:rgba(79,70,229,.85);
      color:#fff;font:600 13px/1 ui-sans-serif,system-ui;border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.35)">${n}</div>`,
    className: '',
    iconSize: [size, size],
  })
}

export default function OpportunityMap({ listings, origin, onSelectListing }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const clusterRef = useRef(null)
  const originMarkerRef = useRef(null)
  const onSelectRef = useRef(onSelectListing)
  onSelectRef.current = onSelectListing

  // Create the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, {
      center: DFW_CENTER,
      zoom: 10,
      scrollWheelZoom: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      iconCreateFunction: clusterIcon,
    })
    map.addLayer(cluster)
    mapRef.current = map
    clusterRef.current = cluster
    return () => {
      map.remove()
      mapRef.current = null
      clusterRef.current = null
    }
  }, [])

  // (Re)build markers whenever the listing set changes.
  useEffect(() => {
    const cluster = clusterRef.current
    const map = mapRef.current
    if (!cluster || !map) return
    cluster.clearLayers()

    const markers = []
    for (const o of listings) {
      const c = geoCoords(o)
      if (!c) continue
      const lat = c.lat + seededOffset(o.id, 'a') * JITTER
      const lng = c.lng + seededOffset(o.id, 'b') * JITTER
      const m = L.marker([lat, lng], { icon: pinIcon() })
      const title = o.opportunity_title || 'Opportunity'
      const org = o.org_name || ''
      m.bindTooltip(
        `<strong>${title.replace(/</g, '&lt;')}</strong>${
          org ? `<br>${org.replace(/</g, '&lt;')}` : ''
        }`,
        { direction: 'top', offset: [0, -8] }
      )
      m.on('click', () => onSelectRef.current?.(o))
      markers.push(m)
    }
    cluster.addLayers(markers)

    // Frame the data: fit to markers (plus origin if set), else DFW.
    const pts = markers.map(m => m.getLatLng())
    if (origin) pts.push(L.latLng(origin.lat, origin.lng))
    if (pts.length) {
      map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 12 })
    } else {
      map.setView(DFW_CENTER, 10)
    }
  }, [listings, origin])

  // Origin ("you"/selected city) marker.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (originMarkerRef.current) {
      originMarkerRef.current.remove()
      originMarkerRef.current = null
    }
    if (origin) {
      originMarkerRef.current = L.marker([origin.lat, origin.lng], {
        icon: originIcon(),
        zIndexOffset: 1000,
      })
        .bindTooltip(origin.label || 'Your location', { direction: 'top', offset: [0, -10] })
        .addTo(map)
    }
  }, [origin])

  return <div ref={containerRef} className="h-full w-full" style={{ minHeight: '60vh' }} />
}
