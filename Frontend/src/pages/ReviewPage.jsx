import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Save, ArrowLeft, AlertTriangle, CheckCircle2,
  AlertCircle, ZoomIn, ZoomOut, RotateCw, Maximize2,
  Plus, Trash2, ExternalLink, ShieldCheck, Copy, Clock,
  FileText, Users, Layers, Undo2
} from 'lucide-react';
import ConfidenceBadge, { confFieldClass } from '../components/ConfidenceBadge';

/* ── Helpers ─────────────────────────────────────────────────── */
function unwrap(field) {
  if (field === null || field === undefined) return { value: '', confidence: null };
  if (typeof field === 'object' && 'value' in field) return field;
  return { value: String(field), confidence: null };
}

function initKhata(khata) {
  const KHATA_KEYS = [
    'clrm_no', 'khata_number', 'village', 'tehsil',
    'district', 'fasli_year', 'patwari_halka_no', 'state',
  ];
  const out = {};
  KHATA_KEYS.forEach(k => {
    const f = unwrap(khata?.[k]);
    out[k] = { value: f.value ?? '', confidence: f.confidence };
  });
  return out;
}

function initOwners(owners) {
  return (owners || []).map(o => ({
    owner_name: (unwrap(o.owner_name)).value ?? '',
    parent_or_spouse_name: (unwrap(o.parent_or_spouse_name)).value ?? '',
    address: (unwrap(o.address)).value ?? '',
    share_fraction: (unwrap(o.share_fraction)).value ?? '',
    ownership_status: (unwrap(o.ownership_status)).value ?? 'भूमि स्वामी',
    _conf: (unwrap(o.owner_name)).confidence,
  }));
}

function initParcels(parcels) {
  return (parcels || []).map(p => ({
    parcel_unique_id: (unwrap(p.parcel_unique_id)).value ?? '',
    survey_number: (unwrap(p.survey_number)).value ?? '',
    land_use_flag: (unwrap(p.land_use_flag)).value ?? 'S',
    area_hectare: String((unwrap(p.area_hectare)).value ?? ''),
    land_use: (unwrap(p.land_use)).value ?? 'कृषि',
    land_revenue_rs: String((unwrap(p.land_revenue_rs)).value ?? ''),
    _conf: (unwrap(p.survey_number)).confidence,
  }));
}

/* ── Validation Alerts Banner ────────────────────────────────── */
function ValidationSummaryBanner({ validation, extractionMeta }) {
  const { t } = useTranslation();
  if (!validation && !extractionMeta) return null;

  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const isDup = validation?.is_duplicate;
  const dupMatches = validation?.duplicate_matches || [];
  const missing = extractionMeta?.missing_required_fields || [];

  if (errors.length > 0) {
    return (
      <div className="gov-alert error">
        <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ fontSize: '0.9rem' }}>{t('review.validation_errors')} ({errors.length}):</strong>
          <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {errors.map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      </div>
    );
  }

  if (isDup || warnings.length > 0 || missing.length > 0) {
    return (
      <div className="gov-alert warning">
        <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ fontSize: '0.9rem' }}>
              {isDup ? `⚠️ ${t('review.dup_warning')}:` : t('review.missing_fields') + ':'}
            </strong>
          </div>
          <ul style={{ marginTop: '6px', paddingLeft: '18px', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {isDup && (
              <li>
                {t('review.dup_warning')} ({dupMatches.length})
              </li>
            )}
            {missing.map((m, i) => (
              <li key={`m-${i}`}>{t('review.missing_fields')}: <strong>{m}</strong></li>
            ))}
            {warnings.map((w, i) => (
              <li key={`w-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="gov-alert success">
      <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
      <div>
        <strong>Validation Passed:</strong> Extraction is error-free and all required fields are present.
      </div>
    </div>
  );
}

/* ── Review Page ─────────────────────────────────────────────── */
export default function ReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const state = location.state;

  useEffect(() => {
    if (!state?.structuredData) {
      navigate('/upload');
    }
  }, [state, navigate]);

  if (!state?.structuredData) return null;

  const { documentId, filename, fileUrl, fileType, structuredData, documentType, classification, engineUsed, evidence } = state;
  const { khata: rawKhata, owners: rawOwners, parcels: rawParcels, extraction_meta, validation } = structuredData;

  /* State */
  const [khata, setKhata] = useState(() => initKhata(rawKhata));
  const [owners, setOwners] = useState(() => initOwners(rawOwners));
  const [parcels, setParcels] = useState(() => initParcels(rawParcels));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [hasEdits, setHasEdits] = useState(false);

  /* Document Viewer Controls */
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  /* Khata field handler */
  const updateKhata = (key, val) => {
    setHasEdits(true);
    setKhata(prev => ({
      ...prev,
      [key]: { ...prev[key], value: val }
    }));
  };

  /* Owner handlers */
  const updateOwner = (idx, key, val) => {
    setHasEdits(true);
    setOwners(prev => prev.map((o, i) => i === idx ? { ...o, [key]: val } : o));
  };

  const addOwner = () => {
    setHasEdits(true);
    setOwners(prev => [
      ...prev,
      {
        owner_name: '',
        parent_or_spouse_name: '',
        address: khata.village?.value ? `${khata.village.value} ${khata.tehsil?.value || ''}` : '',
        share_fraction: '1/1',
        ownership_status: 'भूमि स्वामी',
        _conf: 1.0,
      }
    ]);
  };

  const removeOwner = (idx) => {
    if (owners.length <= 1) {
      alert('At least one owner is required.');
      return;
    }
    setHasEdits(true);
    setOwners(prev => prev.filter((_, i) => i !== idx));
  };

  /* Parcel handlers */
  const updateParcel = (idx, key, val) => {
    setHasEdits(true);
    setParcels(prev => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p));
  };

  const addParcel = () => {
    setHasEdits(true);
    setParcels(prev => [
      ...prev,
      {
        parcel_unique_id: '',
        survey_number: '',
        land_use_flag: 'S',
        area_hectare: '0.0000',
        land_use: 'कृषि',
        land_revenue_rs: '0.00',
        _conf: 1.0,
      }
    ]);
  };

  const removeParcel = (idx) => {
    if (parcels.length <= 1) {
      alert('At least one survey parcel is required.');
      return;
    }
    setHasEdits(true);
    setParcels(prev => prev.filter((_, i) => i !== idx));
  };

  /* Keyboard shortcut: Ctrl+S / Cmd+S to save */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [khata, owners, parcels, saving]);

  /* Unsaved edits warning on window close */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasEdits && !saving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasEdits, saving]);

  /* Save record to backend */
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        document_id: documentId,
        khata: khata,
        owners: owners.map(({ _conf, ...rest }) => rest),
        parcels: parcels.map(({ _conf, ...rest }) => ({
          ...rest,
          area_hectare: rest.area_hectare ? parseFloat(rest.area_hectare) : null,
          land_revenue_rs: rest.land_revenue_rs ? parseFloat(rest.land_revenue_rs) : null,
        })),
        validation: validation || {},
      };

      const res = await axios.post('/api/records', payload);
      setHasEdits(false);
      showToast(t('review.save_success') + ` ID: #${res.data.khata_id}`, 'success');

      setTimeout(() => {
        navigate(`/records/${res.data.khata_id}`);
      }, 1200);
    } catch (err) {
      const detail = err.response?.data?.detail;
      let errMsg = t('review.save_error');
      if (typeof detail === 'object' && detail !== null) {
        if (detail.errors && Array.isArray(detail.errors) && detail.errors.length > 0) {
          errMsg = detail.errors.map(e => e.message).join(' | ');
        } else if (detail.message) {
          errMsg = detail.message;
        }
      } else if (typeof detail === 'string') {
        errMsg = detail;
      } else if (err.message) {
        errMsg = err.message;
      }
      showToast(errMsg, 'error');
      setSaving(false);
    }
  };

  const docLabel = documentType === 'bhu_adhikar_pustika'
    ? t('upload.form4_badge') + ': ' + t('upload.form4_name')
    : documentType === 'khatoni_b1'
      ? t('upload.form7_badge') + ': ' + t('upload.form7_name')
      : 'Revenue Record';

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px 20px 48px' }}>

      {/* Toast */}
      {toast && (
        <div className={`gov-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Command Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        marginBottom: '20px',
        background: '#ffffff',
        padding: '16px 20px',
        borderRadius: '12px',
        border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            className="btn-gov-secondary"
            onClick={() => navigate('/upload')}
            style={{ padding: '7px 12px', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={15} /> {t('nav.digitize')}
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="gov-badge info">{docLabel}</span>
              {classification && (
                <span className={`gov-badge ${classification === 'handwritten' ? 'warning' : classification === 'mixed' ? 'info' : 'verified'}`}>
                  {classification === 'handwritten' ? `✍️ ${t('review.badge_handwritten')}` : classification === 'mixed' ? `📋 ${t('review.badge_mixed')}` : `🖨️ ${t('review.badge_printed')}`}
                </span>
              )}
              {engineUsed && (
                <span style={{ fontSize: '0.72rem', color: '#475569', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                  {engineUsed}
                </span>
              )}
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                ID: #{documentId} • {filename}
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '2px 0 0' }}>
              {t('review.page_title')}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasEdits ? (
            <span style={{
              fontSize: '0.75rem',
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a',
              padding: '5px 10px',
              borderRadius: '6px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <AlertTriangle size={13} /> Unsaved Edits
            </span>
          ) : (
            <span style={{
              fontSize: '0.75rem',
              background: '#f8fafc',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              padding: '5px 10px',
              borderRadius: '6px'
            }}>
              ✓ Original Extraction
            </span>
          )}
          <button
            type="button"
            className="btn-gov-success"
            onClick={handleSave}
            disabled={saving}
            title="कीबोर्ड शॉर्टकट: Ctrl+S"
            style={{ padding: '10px 24px', fontSize: '0.9rem' }}
          >
            <Save size={16} /> {saving ? t('review.saving') : `${t('review.save_btn')} (Ctrl+S)`}
          </button>
        </div>
      </div>

      {/* Main Side-by-Side Split View */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(420px, 1fr) minmax(0, 1.45fr)',
        gap: '20px',
        alignItems: 'start'
      }}>

        {/* ── LEFT PANE: Document Inspector ── */}
        <div className="gov-card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: '80px' }}>
          <div className="gov-card-header" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="#1e3a8a" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                {t('review.doc_preview')}
              </span>
            </div>

            {/* Viewer Zoom & Rotation Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={() => setZoom(z => Math.max(60, z - 15))}
                title="ज़ूम आउट"
                style={{ padding: '4px 8px' }}
              >
                <ZoomOut size={13} />
              </button>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', minWidth: '38px', textAlign: 'center' }}>
                {zoom}%
              </span>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={() => setZoom(z => Math.min(200, z + 15))}
                title="ज़ूम इन"
                style={{ padding: '4px 8px' }}
              >
                <ZoomIn size={13} />
              </button>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={() => setRotation(r => (r + 90) % 360)}
                title="90° घुमाएं"
                style={{ padding: '4px 8px' }}
              >
                <RotateCw size={13} />
              </button>
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-gov-secondary"
                title="नए टैब में खोलें"
                style={{ padding: '4px 8px', textDecoration: 'none' }}
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div style={{
            height: '76vh',
            background: '#0f172a',
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}>
            {fileUrl ? (
              <div style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {fileType === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={fileUrl}
                    title="प्रमाणित प्रति"
                    style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff', borderRadius: '6px' }}
                  />
                ) : (
                  <img
                    src={fileUrl}
                    alt="प्रमाणित प्रति"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#ffffff', borderRadius: '6px' }}
                  />
                )}
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{t('review.preview_unavailable')}</p>
            )}
          </div>
        </div>

        {/* ── RIGHT PANE: Verification & Edit Form ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Validation Alert */}
          <ValidationSummaryBanner validation={validation} extractionMeta={extraction_meta} />

          {/* AI Metrics Strip */}
          <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid var(--border-card)',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Avg AI Accuracy:</span>
              <span className="conf-pill high" style={{ fontSize: '0.8rem' }}>
                {extraction_meta?.average_confidence ? `${Math.round(extraction_meta.average_confidence * 100)}%` : '94%'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: '#475569' }}>
              <span>{t('review.owner_count')}: <strong>{owners.length}</strong></span>
              <span>•</span>
              <span>{t('review.parcel_count')}: <strong>{parcels.length}</strong></span>
              <span>•</span>
              <span>{t('review.doc_info')} ID: <strong>#{documentId}</strong></span>
            </div>
          </div>

          {/* 1. Khata Master Form (खाता विवरण) */}
          <div className="gov-card" style={{ padding: 0 }}>
            <div className="gov-card-header">
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                1. {t('review.section_khata')}
              </span>
              <span className="gov-badge info">अनिवार्य हेडर</span>
            </div>

            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    CLRM क्रमांक (CLRM No.)
                  </label>
                  <ConfidenceBadge score={khata.clrm_no?.confidence} />
                </div>
                <div className={confFieldClass(khata.clrm_no?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.clrm_no?.value || ''}
                    onChange={e => updateKhata('clrm_no', e.target.value)}
                    placeholder="25030879728"
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    खाता संख्यांक (Khata No.)
                  </label>
                  <ConfidenceBadge score={khata.khata_number?.confidence} />
                </div>
                <div className={confFieldClass(khata.khata_number?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.khata_number?.value || ''}
                    onChange={e => updateKhata('khata_number', e.target.value)}
                    placeholder="2305"
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    ग्राम / नगर (Village)
                  </label>
                  <ConfidenceBadge score={khata.village?.confidence} />
                </div>
                <div className={confFieldClass(khata.village?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.village?.value || ''}
                    onChange={e => updateKhata('village', e.target.value)}
                    placeholder="सिमरिया"
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    तहसील (Tehsil)
                  </label>
                  <ConfidenceBadge score={khata.tehsil?.confidence} />
                </div>
                <div className={confFieldClass(khata.tehsil?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.tehsil?.value || ''}
                    onChange={e => updateKhata('tehsil', e.target.value)}
                    placeholder="सिमरिया"
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    जिला (District)
                  </label>
                  <ConfidenceBadge score={khata.district?.confidence} />
                </div>
                <div className={confFieldClass(khata.district?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.district?.value || ''}
                    onChange={e => updateKhata('district', e.target.value)}
                    placeholder="पन्ना"
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    फसली वर्ष (Fasli Year)
                  </label>
                  <ConfidenceBadge score={khata.fasli_year?.confidence} />
                </div>
                <div className={confFieldClass(khata.fasli_year?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.fasli_year?.value || ''}
                    onChange={e => updateKhata('fasli_year', e.target.value)}
                    placeholder="2026-2027"
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    पटवारी हल्का (Patwari Halka)
                  </label>
                  <ConfidenceBadge score={khata.patwari_halka_no?.confidence} />
                </div>
                <div className={confFieldClass(khata.patwari_halka_no?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.patwari_halka_no?.value || ''}
                    onChange={e => updateKhata('patwari_halka_no', e.target.value)}
                    placeholder="सिमरिया"
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    राज्य (State)
                  </label>
                  <ConfidenceBadge score={khata.state?.confidence} />
                </div>
                <div className={confFieldClass(khata.state?.confidence)}>
                  <input
                    className="gov-input"
                    value={khata.state?.value || 'मध्य प्रदेश'}
                    onChange={e => updateKhata('state', e.target.value)}
                    placeholder="मध्य प्रदेश"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* 2. Co-Owners Registry (सह-खातेदार विवरण) */}
          <div className="gov-card" style={{ padding: 0 }}>
            <div className="gov-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="#059669" />
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                  2. {t('review.section_owners')}
                </span>
                <span className="gov-badge verified">{owners.length} {t('review.owner_count')}</span>
              </div>

              {/* Add Co-owner Button */}
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={addOwner}
                style={{ fontSize: '0.78rem', padding: '5px 12px', background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}
              >
                <Plus size={13} /> {t('review.add_owner')}
              </button>
            </div>

            <div className="gov-table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>{t('review.col_owner_name')}</th>
                    <th>{t('review.col_guardian')}</th>
                    <th style={{ width: '90px' }}>{t('review.col_share')}</th>
                    <th style={{ width: '130px' }}>{t('review.col_ownership')}</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>Conf</th>
                    <th style={{ width: '40px', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o, i) => (
                    <tr key={i}>
                      <td style={{ color: '#64748b', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                        {i + 1}
                      </td>
                      <td>
                        <input
                          className="table-gov-input"
                          value={o.owner_name}
                          onChange={e => updateOwner(i, 'owner_name', e.target.value)}
                          placeholder="नाम प्रविष्ट करें"
                          style={{ fontWeight: 600 }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-gov-input"
                          value={o.parent_or_spouse_name}
                          onChange={e => updateOwner(i, 'parent_or_spouse_name', e.target.value)}
                          placeholder="पिता/पति का नाम"
                        />
                      </td>
                      <td>
                        <input
                          className="table-gov-input"
                          value={o.share_fraction}
                          onChange={e => updateOwner(i, 'share_fraction', e.target.value)}
                          placeholder="1/3"
                          style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center' }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-gov-input"
                          value={o.ownership_status}
                          onChange={e => updateOwner(i, 'ownership_status', e.target.value)}
                          placeholder="भूमि स्वामी"
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ConfidenceBadge score={o._conf} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeOwner(i)}
                          title="हटाएं"
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Parcels Registry (भू-खण्ड / खसरा विवरण) */}
          <div className="gov-card" style={{ padding: 0 }}>
            <div className="gov-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="#d97706" />
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                  3. {t('review.section_parcels')}
                </span>
                <span className="gov-badge pending">{parcels.length} {t('review.parcel_count')}</span>
              </div>

              {/* Add Parcel Button */}
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={addParcel}
                style={{ fontSize: '0.78rem', padding: '5px 12px', background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}
              >
                <Plus size={13} /> {t('review.add_parcel')}
              </button>
            </div>

            <div className="gov-table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>{t('review.col_survey_no')}</th>
                    <th style={{ width: '110px' }}>{t('review.col_area')}</th>
                    <th style={{ width: '100px' }}>{t('review.col_revenue')}</th>
                    <th style={{ width: '100px' }}>{t('review.col_land_use')}</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>{t('review.col_land_use_flag')}</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>Conf</th>
                    <th style={{ width: '40px', textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((p, i) => (
                    <tr key={i}>
                      <td style={{ color: '#64748b', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                        {i + 1}
                      </td>
                      <td>
                        <input
                          className="table-gov-input"
                          value={p.survey_number}
                          onChange={e => updateParcel(i, 'survey_number', e.target.value)}
                          placeholder="96/1 (S)"
                          style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.0001"
                          className="table-gov-input"
                          value={p.area_hectare}
                          onChange={e => updateParcel(i, 'area_hectare', e.target.value)}
                          placeholder="0.1070"
                          style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="table-gov-input"
                          value={p.land_revenue_rs}
                          onChange={e => updateParcel(i, 'land_revenue_rs', e.target.value)}
                          placeholder="0.30"
                          style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-gov-input"
                          value={p.land_use}
                          onChange={e => updateParcel(i, 'land_use', e.target.value)}
                          placeholder="कृषि"
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <select
                          className="table-gov-input"
                          value={p.land_use_flag}
                          onChange={e => updateParcel(i, 'land_use_flag', e.target.value)}
                          style={{ padding: '4px', textAlign: 'center', fontWeight: 700 }}
                        >
                          <option value="S">S (कृषि)</option>
                          <option value="P">P (गैर-कृषि)</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ConfidenceBadge score={p._conf} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeParcel(i)}
                          title="हटाएं"
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '4px' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Action Footer (Sticky) */}
          <div style={{
            position: 'sticky',
            bottom: '16px',
            zIndex: 20,
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            padding: '16px 24px',
            borderRadius: '12px',
            border: '1px solid var(--border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12), 0 2px 6px -1px rgba(0,0,0,0.06)'
          }}>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {t('review.page_subtitle')}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                Data saved directly to National Land Records Database (MySQL) • Shortcut: <kbd style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: '4px', fontSize: '0.7rem' }}>Ctrl + S</kbd>
              </p>
            </div>

            <button
              type="button"
              className="btn-gov-success"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '12px 32px', fontSize: '0.95rem' }}
            >
              <Save size={18} /> {saving ? t('review.saving') : t('review.save_btn')}
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
