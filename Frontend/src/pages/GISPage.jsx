import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin, Search, Filter, Layers, Shield, AlertTriangle,
  ExternalLink, CheckCircle2, AlertCircle, ArrowRight, RotateCcw,
  Maximize2, Eye, Building2, User, FileText, Info, HelpCircle
} from 'lucide-react';

/* ── Map Controller Component: Pans/Zooms map dynamically ──── */
function MapBoundsController({ targetBounds, center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (targetBounds) {
      try {
        map.fitBounds(targetBounds, { padding: [40, 40], maxZoom: 18, animate: true });
      } catch (err) {
        console.warn('Could not fit map bounds:', err);
      }
    } else if (center && zoom) {
      map.setView(center, zoom, { animate: true });
    }
  }, [map, targetBounds, center, zoom]);

  return null;
}

/* ── XSS-safe HTML escaping for Leaflet tooltip content ──────
   Prevents arbitrary parcel properties from becoming executable
   HTML if this engine is later connected to real external data.
   For current synthetic/demo data the output is identical.     */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Multi-Layer Base Map Providers ──────────────────────── */
const MAP_LAYERS = {
  google_hybrid: {
    id: 'google_hybrid',
    labelKey: 'gis.layer_google_hybrid',
    defaultLabel: 'Google Satellite',
    icon: '🛰️',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: 'Google Satellite & Roads',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 21,
    isSatellite: true,
  },
  google_streets: {
    id: 'google_streets',
    labelKey: 'gis.layer_google_streets',
    defaultLabel: 'Google Roads',
    icon: '🗺️',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: 'Google Maps',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 21,
    isSatellite: false,
  },
  esri_satellite: {
    id: 'esri_satellite',
    labelKey: 'gis.layer_esri_satellite',
    defaultLabel: 'Bhuvan / Esri GIS',
    icon: '🌐',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri & ISRO Bhuvan Survey',
    subdomains: [],
    maxZoom: 19,
    isSatellite: true,
  },
  osm: {
    id: 'osm',
    labelKey: 'gis.layer_osm',
    defaultLabel: 'OpenStreetMap',
    icon: '📄',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: 'OpenStreetMap contributors',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    isSatellite: false,
  },
};

/* ── Default coordinates for Simariya, Panna (MP) ──────────── */
const SIMARIYA_CENTER = [24.3228, 79.9830];
const DEFAULT_ZOOM = 16;

export default function GISPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  /* ── Map Base Layer State ───────────────────────────────── */
  const [activeLayer, setActiveLayer] = useState('google_hybrid');

  /* ── Core Data State ────────────────────────────────────── */
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── Administrative Hierarchy (nested tree from /api/gis/hierarchy) ─ */
  const [hierarchyTree, setHierarchyTree] = useState({});

  /* ── Cascading Admin Filter State ───────────────────────── */
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedTehsil, setSelectedTehsil] = useState('');
  const [selectedVillage, setSelectedVillage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  /* ── Selection State ────────────────────────────────────── */
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [entireHolding, setEntireHolding] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);

  const geoJsonLayerRef = useRef(null);

  /* ── Computed Cascade Options (derived from hierarchyTree) ─
     Each level only exposes options that exist under the
     selected parent — enforcing true cascading dependency.    */
  const availableStates = useMemo(
    () => Object.keys(hierarchyTree).sort(),
    [hierarchyTree]
  );

  const availableDistricts = useMemo(() => {
    if (!selectedState || !hierarchyTree[selectedState]) return [];
    return Object.keys(hierarchyTree[selectedState].districts || {}).sort();
  }, [hierarchyTree, selectedState]);

  const availableTehsils = useMemo(() => {
    if (!selectedState || !selectedDistrict) return [];
    return Object.keys(
      hierarchyTree[selectedState]?.districts?.[selectedDistrict]?.tehsils || {}
    ).sort();
  }, [hierarchyTree, selectedState, selectedDistrict]);

  const availableVillages = useMemo(() => {
    if (!selectedState || !selectedDistrict || !selectedTehsil) return [];
    return [
      ...(hierarchyTree[selectedState]
        ?.districts?.[selectedDistrict]
        ?.tehsils?.[selectedTehsil]
        ?.villages || [])
    ].sort();
  }, [hierarchyTree, selectedState, selectedDistrict, selectedTehsil]);

  /* ── Cascade Change Handlers (parent resets children) ────── */
  const handleStateChange = (e) => {
    setSelectedState(e.target.value);
    setSelectedDistrict('');
    setSelectedTehsil('');
    setSelectedVillage('');
  };

  const handleDistrictChange = (e) => {
    setSelectedDistrict(e.target.value);
    setSelectedTehsil('');
    setSelectedVillage('');
  };

  const handleTehsilChange = (e) => {
    setSelectedTehsil(e.target.value);
    setSelectedVillage('');
  };

  /* ── 1. Fetch Administrative Hierarchy (nested tree) ─────── */
  useEffect(() => {
    axios.get('/api/gis/hierarchy')
      .then(res => {
        // Use the nested hierarchy tree for cascading dropdown logic
        setHierarchyTree(res.data.hierarchy || {});
        // Note: Do NOT auto-select any dropdown on load.
        // Initial fetch loads the complete dataset with no admin filter.
      })
      .catch(err => console.warn('Could not load GIS hierarchy:', err));
  }, []);

  /* ── 2. Fetch GIS Parcels based on filters ────────────────── */
  const fetchParcels = async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/gis/parcels', { params });
      const featList = res.data.features || [];
      setFeatures(featList);

      // Fit map bounds to returned features on initial load or non-targeted fetch
      if (featList.length > 0 && !params.khata_id && !params.survey_no) {
        const geoLayer = L.geoJSON({ type: 'FeatureCollection', features: featList });
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          setMapBounds(bounds);
        }
      }
    } catch (err) {
      console.error('Error loading GIS parcels:', err);
      setError(err.response?.data?.detail || 'कैडस्ट्रल स्थानिक डेटा लोड करने में असमर्थ।');
    } finally {
      setLoading(false);
    }
  };

  /* Initial full-dataset fetch (no filters) */
  useEffect(() => {
    fetchParcels();
  }, []);

  /* ── 3. Handle Deep-Links from Query Parameters ─────────── */
  useEffect(() => {
    const recordId = searchParams.get('recordId');
    const khataId  = searchParams.get('khataId');
    const surveyNo = searchParams.get('surveyNo');

    if (khataId || recordId) {
      const targetId = khataId || recordId;
      axios.get(`/api/gis/khata/${targetId}`)
        .then(res => {
          const holdingParcels = res.data.features || [];
          if (holdingParcels.length > 0) {
            setEntireHolding({
              khata_id: res.data.khata_id,
              khata_number: res.data.khata_number,
              parcels: holdingParcels,
              total_recorded_area: res.data.total_recorded_area_hectare,
              village: res.data.village,
            });
            // Select first parcel or the specific survey match
            const match = surveyNo
              ? holdingParcels.find(f => f.properties.survey_no === surveyNo) || holdingParcels[0]
              : holdingParcels[0];
            setSelectedParcel(match);

            // Fit bounds to all holding parcels
            const bounds = L.geoJSON({ type: 'FeatureCollection', features: holdingParcels }).getBounds();
            if (bounds.isValid()) setMapBounds(bounds);
          }
        })
        .catch(err => console.warn('Could not resolve deep-linked Khata:', err));
    } else if (surveyNo) {
      setSearchQuery(surveyNo);
      fetchParcels({ survey_no: surveyNo });
    }
  }, [searchParams]);

  /* ── 4. Apply All Active Filters ───────────────────────────
     Sends all 4 administrative levels + search query.
     The backend's /api/gis/parcels accepts all as independent
     query params; each narrows the spatial result set.         */
  const handleApplyFilter = (e) => {
    if (e) e.preventDefault();
    const params = {};
    if (selectedState.trim())    params.state    = selectedState.trim();
    if (selectedDistrict.trim()) params.district = selectedDistrict.trim();
    if (selectedTehsil.trim())   params.tehsil   = selectedTehsil.trim();
    if (selectedVillage.trim())  params.village  = selectedVillage.trim();
    if (searchQuery.trim())      params.q        = searchQuery.trim();
    fetchParcels(params);
  };

  /* ── 5. Reset ALL GIS State ─────────────────────────────────
     Clears every admin filter, search query, parcel selection,
     holding highlight, and map bounds, then reloads the full
     default dataset. Does NOT auto-select any village.         */
  const handleResetFilters = () => {
    setSelectedState('');
    setSelectedDistrict('');
    setSelectedTehsil('');
    setSelectedVillage('');
    setSearchQuery('');
    setSelectedParcel(null);
    setEntireHolding(null);
    setMapBounds(null);
    fetchParcels();   // loads the complete unfiltered dataset
  };

  /* ── 6. View Entire Holding ─────────────────────────────── */
  const handleViewEntireHolding = async (khataId) => {
    if (!khataId) return;
    try {
      const res = await axios.get(`/api/gis/khata/${khataId}`);
      const holdingParcels = res.data.features || [];
      if (holdingParcels.length > 0) {
        setEntireHolding({
          khata_id: res.data.khata_id,
          khata_number: res.data.khata_number,
          parcels: holdingParcels,
          total_recorded_area: res.data.total_recorded_area_hectare,
          village: res.data.village,
        });
        const bounds = L.geoJSON({ type: 'FeatureCollection', features: holdingParcels }).getBounds();
        if (bounds.isValid()) setMapBounds(bounds);
      }
    } catch (err) {
      alert(t('gis.holding_fail'));
    }
  };

  /* ── 7. Interactive GeoJSON Styling ─────────────────────── */
  const getParcelStyle = (feature) => {
    const p = feature.properties;
    const isSelected  = selectedParcel && selectedParcel.properties.parcel_id === p.parcel_id;
    const isInHolding = entireHolding && entireHolding.parcels.some(hp => hp.properties.parcel_id === p.parcel_id);
    const isMatched   = p.match_status === 'MATCHED';
    const isSat       = MAP_LAYERS[activeLayer]?.isSatellite;

    if (isSelected) {
      return {
        color: '#f59e0b',
        weight: 3.5,
        fillColor: '#fbbf24',
        fillOpacity: isSat ? 0.60 : 0.55
      };
    }
    if (isInHolding) {
      return {
        color: isSat ? '#34d399' : '#059669',
        weight: 3,
        fillColor: '#10b981',
        fillOpacity: isSat ? 0.50 : 0.40
      };
    }
    if (!isMatched) {
      return {
        color: isSat ? '#e2e8f0' : '#64748b',
        weight: 1.5,
        fillColor: isSat ? '#cbd5e1' : '#94a3b8',
        fillOpacity: 0.20,
        dashArray: '4, 4'
      };
    }
    return {
      color: isSat ? '#93c5fd' : '#1e3a8a',
      weight: isSat ? 2 : 1.5,
      fillColor: '#3b82f6',
      fillOpacity: isSat ? 0.35 : 0.22
    };
  };

  /* ── 8. Feature Interactions (tooltip, click, hover) ───────
     All dynamic values passed into tooltip HTML are escaped
     through escapeHtml() to prevent XSS if parcel properties
     ever originate from real external cadastral data.          */
  const onEachFeature = (feature, layer) => {
    const p = feature.properties;

    // Build tooltip with XSS-safe escaped values
    const statusColor = p.match_status === 'MATCHED' ? '#15803d' : '#94a3b8';
    layer.bindTooltip(
      `<strong>खसरा संख्या: ${escapeHtml(p.survey_no)}</strong><br/>` +
      `<span>${escapeHtml(p.village)} (${escapeHtml(p.district)})</span><br/>` +
      `<span style="color:${statusColor}">स्थिति: ${escapeHtml(p.match_status)}</span>`,
      { sticky: true, className: 'gis-map-tooltip' }
    );

    layer.on({
      click: () => {
        setSelectedParcel(feature);
        setMapBounds(layer.getBounds());
      },
      mouseover: (e) => {
        const target = e.target;
        if (!selectedParcel || selectedParcel.properties.parcel_id !== p.parcel_id) {
          target.setStyle({ weight: 2.5, fillOpacity: 0.4 });
        }
      },
      mouseout: (e) => {
        if (geoJsonLayerRef.current) {
          geoJsonLayerRef.current.resetStyle(e.target);
        }
      }
    });
  };

  /* ── Quick KPI counts ─────────────────────────────────────── */
  const matchedCount   = useMemo(() => features.filter(f => f.properties.match_status === 'MATCHED').length, [features]);
  const unmatchedCount = useMemo(() => features.filter(f => f.properties.match_status === 'UNMATCHED').length, [features]);

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px 20px 60px' }}>

      {/* 1. Header & Title Bar */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px', marginBottom: '16px',
        background: '#ffffff', padding: '20px 24px',
        borderRadius: '12px', border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="gov-badge info">
              <Layers size={13} /> {t('gis.badge')}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t('gis.crs')}</span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            {t('gis.title')}
          </h1>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '4px' }}>
            {t('gis.subtitle')}
          </p>
        </div>

        {/* Quick KPI Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, display: 'block' }}>{t('gis.chip_matched')}</span>
            <strong style={{ fontSize: '1.1rem', color: '#15803d', fontFamily: 'var(--font-mono)' }}>{matchedCount}</strong>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, display: 'block' }}>{t('gis.chip_unmatched')}</span>
            <strong style={{ fontSize: '1.1rem', color: '#475569', fontFamily: 'var(--font-mono)' }}>{unmatchedCount}</strong>
          </div>
        </div>
      </div>

      {/* 2. Mandatory Prototype Data Disclaimer Banner (PRD §19, §71) */}
      <div style={{
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px',
        padding: '10px 16px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', gap: '12px',
        color: '#92400e', fontSize: '0.825rem', lineHeight: 1.5
      }}>
        <AlertTriangle size={18} style={{ flexShrink: 0, color: '#d97706' }} />
        <div>
          <strong>{t('gis.disclaimer_title')}</strong> {t('gis.disclaimer_body')} <strong>{t('gis.disclaimer_demo')}</strong>{t('gis.disclaimer_end')}
        </div>
      </div>

      {/* 3. Search & Administrative Filter Bar */}
      <div className="gov-card" style={{ padding: '14px 20px', marginBottom: '16px' }}>
        <form onSubmit={handleApplyFilter}>

          {/* Row 1: Cascading Admin Dropdowns */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>

            {/* State Filter */}
            <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                {t('gis.filter_state')}
              </label>
              <select
                value={selectedState}
                onChange={handleStateChange}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
              >
                <option value="">{t('gis.filter_state_all')}</option>
                {availableStates.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* District Filter — options depend on selectedState */}
            <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                {t('gis.filter_district')}
              </label>
              <select
                value={selectedDistrict}
                onChange={handleDistrictChange}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                disabled={availableDistricts.length === 0}
              >
                <option value="">{t('gis.filter_district_all')}</option>
                {availableDistricts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Tehsil Filter — options depend on selectedDistrict */}
            <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                {t('gis.filter_tehsil')}
              </label>
              <select
                value={selectedTehsil}
                onChange={handleTehsilChange}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                disabled={availableTehsils.length === 0}
              >
                <option value="">{t('gis.filter_tehsil_all')}</option>
                {availableTehsils.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Village Filter — options depend on selectedTehsil */}
            <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                {t('gis.filter_village')}
              </label>
              <select
                value={selectedVillage}
                onChange={e => setSelectedVillage(e.target.value)}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                disabled={availableVillages.length === 0}
              >
                <option value="">{t('gis.filter_village_all')}</option>
                {availableVillages.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Row 2: Search + Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>

            {/* General Search */}
            <div style={{ minWidth: '240px', flex: '2 1 240px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                {t('gis.search_label')}
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder={t('gis.search_placeholder')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="gov-input"
                  style={{ paddingLeft: '32px', paddingRight: '10px', paddingBlock: '7px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn-gov-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
                <Search size={14} /> {t('gis.btn_search')}
              </button>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={handleResetFilters}
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                title={t('gis.btn_reset_title')}
              >
                <RotateCcw size={14} /> {t('gis.btn_reset')}
              </button>
            </div>

          </div>
        </form>
      </div>

      {/* 4. Entire Holding Active Banner */}
      {entireHolding && (
        <div style={{
          background: '#ecfdf5', border: '1px solid #a7f3d0',
          padding: '12px 18px', borderRadius: '10px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#059669', color: '#ffffff', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
              {t('gis.holding_badge')} {entireHolding.khata_number}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#065f46', fontWeight: 600 }}>
              {t('gis.holding_parcels')} <strong>{entireHolding.parcels.length}</strong> {t('gis.holding_parcels_unit')} • {t('gis.holding_area')} <strong>{entireHolding.total_recorded_area}</strong> {t('gis.holding_area_unit')} ({entireHolding.village})
            </span>
          </div>
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => setEntireHolding(null)}
            style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: '#6ee7b7', color: '#047857' }}
          >
            {t('gis.holding_clear')}
          </button>
        </div>
      )}

      {/* 5. Main Side-by-Side Map Canvas & Details Panel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.85fr) minmax(360px, 1.15fr)',
        gap: '20px',
        alignItems: 'start'
      }}>

        {/* ── Left Pane: Interactive Cadastral Map ── */}
        <div className="gov-card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>

          {/* Map Sub-Header & Legend */}
          <div style={{
            padding: '10px 16px', background: '#fafafa',
            borderBottom: '1px solid var(--border-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: '0.78rem', color: '#64748b'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={14} color="#1e3a8a" />
              <span>{t('gis.map_sheet')} <strong>Simariya</strong> {t('gis.map_level')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px', display: 'inline-block' }} /> {t('gis.legend_khasra')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: '#fbbf24', borderRadius: '2px', display: 'inline-block' }} /> {t('gis.legend_selected')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '2px', display: 'inline-block' }} /> {t('gis.legend_holding')}
              </span>
            </div>
          </div>

          {/* Leaflet Map Container */}
          <div style={{ height: '580px', width: '100%', position: 'relative', background: '#0f172a' }}>
            {/* Multi-Layer Switcher Toolbar */}
            <div style={{
              position: 'absolute', top: '12px', right: '12px', zIndex: 1000,
              display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)', padding: '3px', borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.22)', border: '1px solid #cbd5e1', gap: '3px'
            }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', padding: '0 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Layers size={13} color="#1e3a8a" /> {t('gis.base_layer', 'Base Layer:')}
              </span>
              {Object.values(MAP_LAYERS).map(layer => {
                const isActive = activeLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    onClick={() => setActiveLayer(layer.id)}
                    type="button"
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.74rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#ffffff' : '#1e293b',
                      background: isActive ? '#1e3a8a' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                    title={layer.attribution}
                  >
                    <span>{layer.icon}</span>
                    <span>{t(layer.labelKey, layer.defaultLabel)}</span>
                  </button>
                );
              })}
            </div>

            {loading && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
                zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', fontSize: '0.9rem', color: '#1e3a8a', fontWeight: 600
              }}>
                <div className="gov-spinner" /> {t('gis.map_loading')}
              </div>
            )}

            {error && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.9)',
                zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: '8px', padding: '24px', textAlign: 'center'
              }}>
                <AlertTriangle size={32} color="#dc2626" />
                <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.9rem' }}>{error}</span>
              </div>
            )}

            <MapContainer
              center={SIMARIYA_CENTER}
              zoom={DEFAULT_ZOOM}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                key={activeLayer}
                attribution={MAP_LAYERS[activeLayer]?.attribution || 'Google Satellite'}
                url={MAP_LAYERS[activeLayer]?.url}
                maxZoom={MAP_LAYERS[activeLayer]?.maxZoom || 20}
                subdomains={MAP_LAYERS[activeLayer]?.subdomains || ['a', 'b', 'c']}
              />

              <MapBoundsController targetBounds={mapBounds} />

              {features.length > 0 && (
                <GeoJSON
                  key={`geojson-${features.length}-${selectedParcel?.properties?.parcel_id}-${entireHolding?.parcels?.length}-${activeLayer}`}
                  ref={geoJsonLayerRef}
                  data={{ type: 'FeatureCollection', features }}
                  style={getParcelStyle}
                  onEachFeature={onEachFeature}
                />
              )}
            </MapContainer>
          </div>

          {/* Map Footer */}
          <div style={{
            padding: '8px 16px', background: '#fafafa',
            borderTop: '1px solid var(--border-card)',
            fontSize: '0.75rem', color: '#64748b',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span>{t('gis.map_footer_hint')}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{MAP_LAYERS[activeLayer]?.icon}</span>
              <strong style={{ color: '#1e3a8a' }}>{t(MAP_LAYERS[activeLayer]?.labelKey, MAP_LAYERS[activeLayer]?.defaultLabel)}</strong>
              <span>({MAP_LAYERS[activeLayer]?.attribution})</span>
            </span>
          </div>

        </div>

        {/* ── Right Pane: Parcel Details & Land Record Card ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {selectedParcel ? (
            <div className="gov-card" style={{ padding: 0, overflow: 'hidden' }}>

              {/* Header */}
              <div className="gov-card-header" style={{ padding: '16px 20px', background: '#f8fafc' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      background: '#1e3a8a', color: '#ffffff',
                      fontSize: '0.8rem', fontWeight: 800,
                      padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)'
                    }}>
                      खसरा: {selectedParcel.properties.survey_no}
                    </span>

                    {selectedParcel.properties.match_status === 'MATCHED' ? (
                      <span className="gov-badge verified">
                        <CheckCircle2 size={11} /> {t('gis.badge_matched')}
                      </span>
                    ) : selectedParcel.properties.match_status === 'AMBIGUOUS' ? (
                      <span className="gov-badge warning">
                        <AlertTriangle size={11} /> {t('gis.badge_ambiguous')}
                      </span>
                    ) : (
                      <span className="gov-badge pending">
                        <Info size={11} /> {t('gis.badge_unmatched')}
                      </span>
                    )}
                  </div>

                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {t('gis.parcel_id_label')} <code>{selectedParcel.properties.parcel_id}</code>
                  </span>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '18px 20px' }}>

                {/* Spatial & Geographic Information */}
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('gis.spatial_section')}
                </h4>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px',
                  background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px'
                }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>{t('gis.field_village')}</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.village}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>{t('gis.field_tehsil_dist')}</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.tehsil}, {selectedParcel.properties.district}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>{t('gis.field_land_use')}</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.land_use || 'कृषि'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>{t('gis.field_state')}</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.state}</strong>
                  </div>
                </div>

                {/* Area Breakdown (GIS_guide.md §33) */}
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('gis.area_section')}
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '18px' }}>
                  <div style={{ padding: '12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, display: 'block' }}>
                      {t('gis.recorded_area_label')}
                    </span>
                    <strong style={{ fontSize: '1.1rem', color: '#15803d', fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.properties.recorded_area_hectare != null
                        ? `${selectedParcel.properties.recorded_area_hectare} ${t('gis.recorded_area_unit')}`
                        : t('gis.recorded_area_na')}
                    </strong>
                    <span style={{ fontSize: '0.675rem', color: '#166534', display: 'block', marginTop: '2px' }}>
                      {t('gis.recorded_area_source')}
                    </span>
                  </div>

                  <div style={{ padding: '12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
                      {t('gis.spatial_area_label')}
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: '#475569' }}>
                      {selectedParcel.properties.spatial_area_hectare || 'Not calculated'}
                    </strong>
                    <span style={{ fontSize: '0.675rem', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                      {t('gis.spatial_area_note')}
                    </span>
                  </div>
                </div>

                {/* Linked Land Record (match_status dependent) */}
                {selectedParcel.properties.match_status === 'MATCHED' ? (
                  <div style={{ border: '1px solid #bfdbfe', background: '#eff6ff', padding: '14px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1e40af', fontWeight: 700, fontSize: '0.85rem' }}>
                      <FileText size={15} /> {t('gis.linked_khata_section')}
                    </div>

                    {selectedParcel.properties.is_duplicate_flag && selectedParcel.properties.duplicate_records_count > 1 && (
                      <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', fontSize: '0.75rem', color: '#854d0e' }}>
                        ⚠️ {selectedParcel.properties.duplicate_records_count} {t('gis.dup_warning')}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.8rem', color: '#1e3a8a', marginBottom: '12px' }}>
                      <div>
                        <span style={{ color: '#60a5fa', display: 'block', fontSize: '0.7rem' }}>{t('gis.khata_no_label')}</span>
                        <strong>{selectedParcel.properties.khata_number}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#60a5fa', display: 'block', fontSize: '0.7rem' }}>{t('gis.db_id_label')}</span>
                        <code>#{selectedParcel.properties.khata_id}</code>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: '#60a5fa', display: 'block', fontSize: '0.7rem' }}>{t('gis.owner_label')}</span>
                        <strong>{selectedParcel.properties.primary_owner || '—'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-gov-primary"
                        onClick={() => navigate(`/records/${selectedParcel.properties.khata_id}`)}
                        style={{ padding: '7px 14px', fontSize: '0.8rem', flex: 1 }}
                      >
                        <ExternalLink size={13} /> {t('gis.btn_open_record')}
                      </button>

                      <button
                        type="button"
                        className="btn-gov-secondary"
                        onClick={() => handleViewEntireHolding(selectedParcel.properties.khata_id)}
                        style={{ padding: '7px 12px', fontSize: '0.8rem', borderColor: '#93c5fd', color: '#1d4ed8' }}
                      >
                        <Layers size={13} /> {t('gis.btn_holding')}
                      </button>
                    </div>
                  </div>

                ) : selectedParcel.properties.match_status === 'AMBIGUOUS' ? (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#92400e', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                      <AlertTriangle size={15} /> {t('gis.ambiguous_title')}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem' }}>
                      {t('gis.ambiguous_desc', { count: selectedParcel.properties.ambiguous_matches_count || '?' })}
                      {selectedParcel.properties.ambiguous_khatas?.length > 0
                        ? ` (Khata: ${selectedParcel.properties.ambiguous_khatas.join(', ')})`
                        : ''
                      }. {t('gis.ambiguous_review')}
                    </p>
                  </div>

                ) : (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#64748b', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '2px' }}>
                      <Info size={15} /> {t('gis.unmatched_title')}
                    </div>
                    <span style={{ fontSize: '0.725rem' }}>
                      {t('gis.unmatched_desc')}
                    </span>
                  </div>
                )}

                {/* Provenance note */}
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: 0 }}>
                  {t('gis.provenance_status')} <code>DEMO_GEOMETRY</code> • {t('gis.provenance_auth')} <code>UNVERIFIED_SYNTHETIC</code>
                </p>

              </div>
            </div>

          ) : (
            <div className="gov-card" style={{ padding: '40px 24px', textAlign: 'center', color: '#64748b' }}>
              <Layers size={42} style={{ margin: '0 auto 12px', opacity: 0.35, color: '#1e3a8a' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                {t('gis.parcel_none_title')}
              </h3>
              <p style={{ fontSize: '0.825rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                {t('gis.parcel_none_desc')}
              </p>
            </div>
          )}

          {/* About GIS Module Card */}
          <div className="gov-card" style={{ padding: '16px 20px', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#1e3a8a', fontWeight: 700, fontSize: '0.85rem' }}>
              <Shield size={16} /> {t('gis.dilrmp_title')}
            </div>
            <p style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
              {t('gis.dilrmp_desc')}
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
