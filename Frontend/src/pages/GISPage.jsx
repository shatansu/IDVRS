import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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

/* ── Default coordinates for Simariya, Panna (MP) ──────────── */
const SIMARIYA_CENTER = [24.3228, 79.9830];
const DEFAULT_ZOOM = 16;

export default function GISPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

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
      alert('संपूर्ण खाता विवरण लोड करने में विफलता हुई।');
    }
  };

  /* ── 7. Interactive GeoJSON Styling ─────────────────────── */
  const getParcelStyle = (feature) => {
    const p = feature.properties;
    const isSelected  = selectedParcel && selectedParcel.properties.parcel_id === p.parcel_id;
    const isInHolding = entireHolding && entireHolding.parcels.some(hp => hp.properties.parcel_id === p.parcel_id);
    const isMatched   = p.match_status === 'MATCHED';

    if (isSelected) {
      return { color: '#f59e0b', weight: 3.5, fillColor: '#fbbf24', fillOpacity: 0.55 };
    }
    if (isInHolding) {
      return { color: '#059669', weight: 2.5, fillColor: '#10b981', fillOpacity: 0.40 };
    }
    if (!isMatched) {
      return { color: '#64748b', weight: 1.5, fillColor: '#94a3b8', fillOpacity: 0.15, dashArray: '4, 4' };
    }
    return { color: '#1e3a8a', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.22 };
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
              <Layers size={13} /> भू-नक्शा एवं कैडस्ट्रल मानचित्र (Cadastral Map Engine)
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>• WGS 84 (EPSG:4326)</span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            डिजिटल भू-नक्शा एवं स्थानिक भू-खण्ड विज़ुअलाइज़ेशन
          </h1>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '4px' }}>
            अभिलेख पंजिका (MySQL Records) और कैडस्ट्रल पार्सल ज्यामिति का 5-बिंदु लिंकेज: राज्य, जिला, तहसील, ग्राम एवं खसरा संख्या
          </p>
        </div>

        {/* Quick KPI Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, display: 'block' }}>सत्यापित खसरे (Matched)</span>
            <strong style={{ fontSize: '1.1rem', color: '#15803d', fontFamily: 'var(--font-mono)' }}>{matchedCount}</strong>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, display: 'block' }}>असंबद्ध खसरे (Unmatched)</span>
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
          <strong>प्रोटोटाइप स्थानिक डेटा सूचना (Prototype GIS Notice):</strong> यहाँ प्रदर्शित खसरा सीमाएं नमूना भूमि अभिलेखों के खसरा नंबरों पर आधारित <strong>सिंथेटिक / प्रोटोटाइप ज्यामिति (Demo Geometry)</strong> हैं। यह कोई आधिकारिक सरकारी भू-नक्शा सीमा नहीं है।
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
                राज्य (State)
              </label>
              <select
                value={selectedState}
                onChange={handleStateChange}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
              >
                <option value="">सभी राज्य (All)</option>
                {availableStates.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* District Filter — options depend on selectedState */}
            <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                जिला (District)
              </label>
              <select
                value={selectedDistrict}
                onChange={handleDistrictChange}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                disabled={availableDistricts.length === 0}
              >
                <option value="">सभी जिले (All)</option>
                {availableDistricts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Tehsil Filter — options depend on selectedDistrict */}
            <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                तहसील (Tehsil)
              </label>
              <select
                value={selectedTehsil}
                onChange={handleTehsilChange}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                disabled={availableTehsils.length === 0}
              >
                <option value="">सभी तहसील (All)</option>
                {availableTehsils.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Village Filter — options depend on selectedTehsil */}
            <div style={{ minWidth: '150px', flex: '1 1 150px' }}>
              <label style={{ display: 'block', fontSize: '0.725rem', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                ग्राम (Village)
              </label>
              <select
                value={selectedVillage}
                onChange={e => setSelectedVillage(e.target.value)}
                className="gov-input"
                style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                disabled={availableVillages.length === 0}
              >
                <option value="">सभी ग्राम (All)</option>
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
                खसरा संख्या / खाता संख्या / पार्सल आईडी खोजें
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="उदा. 101, 96/1, 2305, SIM-P101..."
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
                <Search size={14} /> पार्सल खोजें
              </button>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={handleResetFilters}
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                title="सभी फ़िल्टर साफ़ करें और संपूर्ण नक्शा पुनः लोड करें"
              >
                <RotateCcw size={14} /> रीसेट
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
              खाता संख्या: {entireHolding.khata_number}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#065f46', fontWeight: 600 }}>
              संपूर्ण खाता धारक खसरे: <strong>{entireHolding.parcels.length}</strong> खसरे • कुल दर्ज रकबा: <strong>{entireHolding.total_recorded_area}</strong> हे. ({entireHolding.village})
            </span>
          </div>
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => setEntireHolding(null)}
            style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: '#6ee7b7', color: '#047857' }}
          >
            होल्डिंग हाइलाइट हटाएं
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
              <span>कैडस्ट्रल शीट: <strong>सिमरिया (Simariya)</strong> • खसरा पॉलीगॉन स्तर</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px', display: 'inline-block' }} /> खसरा
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: '#fbbf24', borderRadius: '2px', display: 'inline-block' }} /> चयनित
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '2px', display: 'inline-block' }} /> होल्डिंग
              </span>
            </div>
          </div>

          {/* Leaflet Map Container */}
          <div style={{ height: '580px', width: '100%', position: 'relative', background: '#e2e8f0' }}>
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
                zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', fontSize: '0.9rem', color: '#1e3a8a', fontWeight: 600
              }}>
                <div className="gov-spinner" /> कैडस्ट्रल नक्शा लोड हो रहा है...
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
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapBoundsController targetBounds={mapBounds} />

              {features.length > 0 && (
                <GeoJSON
                  key={`geojson-${features.length}-${selectedParcel?.properties?.parcel_id}-${entireHolding?.parcels?.length}`}
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
            <span>क्लिक करके किसी भी खसरा पॉलीगॉन की जानकारी देखें</span>
            <span>OpenStreetMap Base Layer</span>
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
                        <CheckCircle2 size={11} /> रिकॉर्ड लिंक (MATCHED)
                      </span>
                    ) : selectedParcel.properties.match_status === 'AMBIGUOUS' ? (
                      <span className="gov-badge warning">
                        <AlertTriangle size={11} /> संदिग्ध (AMBIGUOUS)
                      </span>
                    ) : (
                      <span className="gov-badge pending">
                        <Info size={11} /> असंबद्ध (UNMATCHED)
                      </span>
                    )}
                  </div>

                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    पार्सल आईडी: <code>{selectedParcel.properties.parcel_id}</code>
                  </span>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '18px 20px' }}>

                {/* Spatial & Geographic Information */}
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  स्थानिक विवरण (Spatial Attributes)
                </h4>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px',
                  background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px'
                }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>ग्राम</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.village}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>तहसील / जिला</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.tehsil}, {selectedParcel.properties.district}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>भूमि उपयोग (Land Use)</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.land_use || 'कृषि'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: 600 }}>राज्य (State)</span>
                    <strong style={{ fontSize: '0.875rem', color: '#1e293b' }}>{selectedParcel.properties.state}</strong>
                  </div>
                </div>

                {/* Area Breakdown (GIS_guide.md §33) */}
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  क्षेत्रफल तुलना (Area Breakdown)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '18px' }}>
                  <div style={{ padding: '12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 700, display: 'block' }}>
                      आधिकारिक दर्ज रकबा (Recorded Area)
                    </span>
                    <strong style={{ fontSize: '1.1rem', color: '#15803d', fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.properties.recorded_area_hectare != null
                        ? `${selectedParcel.properties.recorded_area_hectare} हे.`
                        : 'उपलब्ध नहीं'}
                    </strong>
                    <span style={{ fontSize: '0.675rem', color: '#166534', display: 'block', marginTop: '2px' }}>
                      स्रोत: राजस्व अधिकार अभिलेख
                    </span>
                  </div>

                  <div style={{ padding: '12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, display: 'block' }}>
                      स्थानिक ज्यामिति क्षेत्रफल (Spatial Area)
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: '#475569' }}>
                      {selectedParcel.properties.spatial_area_hectare || 'Not calculated'}
                    </strong>
                    <span style={{ fontSize: '0.675rem', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                      सिंथेटिक ज्यामिति पर संगणित नहीं
                    </span>
                  </div>
                </div>

                {/* Linked Land Record (match_status dependent) */}
                {selectedParcel.properties.match_status === 'MATCHED' ? (
                  <div style={{ border: '1px solid #bfdbfe', background: '#eff6ff', padding: '14px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1e40af', fontWeight: 700, fontSize: '0.85rem' }}>
                      <FileText size={15} /> संबद्ध भू-अभिलेख खाता (Linked Khata)
                    </div>

                    {selectedParcel.properties.is_duplicate_flag && selectedParcel.properties.duplicate_records_count > 1 && (
                      <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', fontSize: '0.75rem', color: '#854d0e' }}>
                        ⚠️ {selectedParcel.properties.duplicate_records_count} डुप्लीकेट DB रिकॉर्ड — सर्वोत्तम मिलान चुना गया। मानवीय समीक्षा अनुशंसित।
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.8rem', color: '#1e3a8a', marginBottom: '12px' }}>
                      <div>
                        <span style={{ color: '#60a5fa', display: 'block', fontSize: '0.7rem' }}>खाता संख्या (Khata No.)</span>
                        <strong>{selectedParcel.properties.khata_number}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#60a5fa', display: 'block', fontSize: '0.7rem' }}>डेटाबेस रिकॉर्ड आईडी</span>
                        <code>#{selectedParcel.properties.khata_id}</code>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: '#60a5fa', display: 'block', fontSize: '0.7rem' }}>मुख्य खातेदार</span>
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
                        <ExternalLink size={13} /> अधिकार अभिलेख खोलें
                      </button>

                      <button
                        type="button"
                        className="btn-gov-secondary"
                        onClick={() => handleViewEntireHolding(selectedParcel.properties.khata_id)}
                        style={{ padding: '7px 12px', fontSize: '0.8rem', borderColor: '#93c5fd', color: '#1d4ed8' }}
                      >
                        <Layers size={13} /> संपूर्ण होल्डिंग
                      </button>
                    </div>
                  </div>

                ) : selectedParcel.properties.match_status === 'AMBIGUOUS' ? (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#92400e', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                      <AlertTriangle size={15} /> एकाधिक खातेदार मिलान मिले (Ambiguous Match)
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem' }}>
                      इस खसरा नंबर से {selectedParcel.properties.ambiguous_matches_count || 'कई'} भिन्न रिकॉर्ड जुड़े हैं
                      {selectedParcel.properties.ambiguous_khatas?.length > 0
                        ? ` (खाता संख्या: ${selectedParcel.properties.ambiguous_khatas.join(', ')})`
                        : ''
                      }. मानवीय समीक्षा आवश्यक है।
                    </p>
                  </div>

                ) : (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#64748b', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, marginBottom: '2px' }}>
                      <Info size={15} /> कोई संबद्ध भूमि अभिलेख नहीं मिला
                    </div>
                    <span style={{ fontSize: '0.725rem' }}>
                      यह खसरा स्थानिक नक्शे में मौजूद है लेकिन MySQL रजिस्ट्री में इसका कोई खतौनी/पुस्तिका रिकॉर्ड दर्ज नहीं है।
                    </span>
                  </div>
                )}

                {/* Provenance note */}
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: 0 }}>
                  डेटा स्थिति: <code>DEMO_GEOMETRY</code> • प्रामाणिकता: <code>UNVERIFIED_SYNTHETIC</code>
                </p>

              </div>
            </div>

          ) : (
            <div className="gov-card" style={{ padding: '40px 24px', textAlign: 'center', color: '#64748b' }}>
              <Layers size={42} style={{ margin: '0 auto 12px', opacity: 0.35, color: '#1e3a8a' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                कोई खसरा चयनित नहीं है
              </h3>
              <p style={{ fontSize: '0.825rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                मानचित्र पर किसी भी खसरा पॉलीगॉन पर क्लिक करें अथवा ऊपर दिए सर्च बार में खसरा संख्या (जैसे <strong>101</strong>, <strong>96/1</strong>, <strong>100</strong>) खोजें।
              </p>
            </div>
          )}

          {/* About GIS Module Card */}
          <div className="gov-card" style={{ padding: '16px 20px', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#1e3a8a', fontWeight: 700, fontSize: '0.85rem' }}>
              <Shield size={16} /> DILRMP भू-नक्शा एकीकरण सिद्धांत
            </div>
            <p style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
              भू-अभिलेख (टेक्स्ट) और भू-नक्शा (ज्यामिति) अलग-अलग लेयर्स हैं। IDVRS का GIS इंजन दोनों को 5-बिंदु कुंजी से जोड़ता है। भविष्य में इसे राज्य के भू-नक्शा (Bhu-Naksha) अथवा PostGIS सर्वर के साथ सीधे प्लग किया जा सकता है।
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
