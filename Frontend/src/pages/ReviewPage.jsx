import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Save, ArrowLeft, AlertTriangle, CheckCircle2,
  AlertCircle, Info, Loader2, ExternalLink
} from 'lucide-react';
import ConfidenceBadge, { confFieldClass } from '../components/ConfidenceBadge';

/* ── Helpers ──────────────────────────────────────────────────── */

/** Unwrap a confidence-wrapped field or plain value */
function unwrap(field) {
  if (field === null || field === undefined) return { value: '', confidence: null };
  if (typeof field === 'object' && 'value' in field) return field;
  return { value: String(field), confidence: null };
}

/** Deep-clone structured data for editable state */
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
    owner_name:            (unwrap(o.owner_name)).value ?? '',
    parent_or_spouse_name: (unwrap(o.parent_or_spouse_name)).value ?? '',
    address:               (unwrap(o.address)).value ?? '',
    share_fraction:        (unwrap(o.share_fraction)).value ?? '',
    ownership_status:      (unwrap(o.ownership_status)).value ?? '',
    _conf:                 (unwrap(o.owner_name)).confidence,
  }));
}

function initParcels(parcels) {
  return (parcels || []).map(p => ({
    parcel_unique_id: (unwrap(p.parcel_unique_id)).value ?? '',
    survey_number:    (unwrap(p.survey_number)).value ?? '',
    land_use_flag:    (unwrap(p.land_use_flag)).value ?? '',
    area_hectare:     String((unwrap(p.area_hectare)).value ?? ''),
    land_use:         (unwrap(p.land_use)).value ?? '',
    land_revenue_rs:  String((unwrap(p.land_revenue_rs)).value ?? ''),
    _conf:            (unwrap(p.survey_number)).confidence,
  }));
}

/* ── Validation Banner ─────────────────────────────────────────── */
function ValidationBanner({ validation, extractionMeta }) {
  if (!validation && !extractionMeta) return null;

  const errors   = validation?.errors   || [];
  const warnings = validation?.warnings || [];
  const isDup    = validation?.is_duplicate;
  const needsRev = extractionMeta?.needs_review;
  const missing  = extractionMeta?.missing_required_fields || [];

  if (errors.length > 0) {
    return (
      <div className="validation-banner error">
        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Validation Errors ({errors.length})</strong>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7 }}>
            {errors.map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      </div>
    );
  }

  if (isDup || warnings.length > 0 || needsRev) {
    const msgs = [];
    if (isDup) msgs.push('Possible duplicate record detected — verify before saving.');
    if (missing.length > 0) msgs.push(`Missing fields: ${missing.join(', ')}`);
    warnings.forEach(w => { if (!msgs.some(m => m.includes(w.message.slice(0, 30)))) msgs.push(w.message); });

    return (
      <div className="validation-banner warning">
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Attention Required</strong>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: '0.85rem', lineHeight: 1.7 }}>
            {msgs.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="validation-banner success">
      <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
      <span><strong>All checks passed</strong> — extraction looks clean. Review fields below, then save.</span>
    </div>
  );
}

/* ── Labeled editable field ────────────────────────────────────── */
function FieldRow({ label, fieldKey, value, confidence, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </label>
        <ConfidenceBadge score={confidence} />
      </div>
      <div className={confFieldClass(confidence)}>
        <input
          className="form-input"
          value={value}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
}

/* ── Toast ──────────────────────────────────────────────────────── */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type}`}>
      {toast.type === 'success'
        ? <CheckCircle2 size={18} />
        : <AlertCircle size={18} />}
      {toast.message}
    </div>
  );
}

/* ── Main ReviewPage ─────────────────────────────────────────────── */
export default function ReviewPage() {
  const location = useLocation();
  const navigate  = useNavigate();
  const state     = location.state;

  // Redirect if no state (direct URL access)
  useEffect(() => {
    if (!state?.structuredData) navigate('/upload');
  }, [state, navigate]);

  if (!state?.structuredData) return null;

  const { documentId, filename, fileUrl, fileType, structuredData, documentType } = state;
  const { khata: rawKhata, owners: rawOwners, parcels: rawParcels, extraction_meta, validation } = structuredData;

  /* Editable state */
  const [khata,   setKhata]   = useState(() => initKhata(rawKhata));
  const [owners,  setOwners]  = useState(() => initOwners(rawOwners));
  const [parcels, setParcels] = useState(() => initParcels(rawParcels));
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  /* Khata field update */
  const updateKhata = (key, val) =>
    setKhata(prev => ({ ...prev, [key]: { ...prev[key], value: val } }));

  /* Owner cell update */
  const updateOwner = (idx, key, val) =>
    setOwners(prev => prev.map((o, i) => i === idx ? { ...o, [key]: val } : o));

  /* Parcel cell update */
  const updateParcel = (idx, key, val) =>
    setParcels(prev => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p));

  /* Save record */
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        document_id: documentId,
        khata:   khata,
        owners:  owners.map(({ _conf, ...rest }) => rest),
        parcels: parcels.map(({ _conf, ...rest }) => ({
          ...rest,
          area_hectare:    rest.area_hectare    ? parseFloat(rest.area_hectare)    : null,
          land_revenue_rs: rest.land_revenue_rs ? parseFloat(rest.land_revenue_rs) : null,
        })),
        validation: validation || {},
      };
      const res = await axios.post('/api/records', payload);
      showToast(
        `Record saved — Khata ID ${res.data.khata_id} · ${res.data.owners_saved} owners · ${res.data.parcels_saved} parcels`,
        'success'
      );
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Save failed.';
      showToast(detail, 'error');
    } finally {
      setSaving(false);
    }
  };

  /* Doc type label */
  const docTypeLabel = documentType === 'bhu_adhikar_pustika'
    ? 'Bhu-Adhikar Pustika (Form 4)'
    : documentType === 'khatoni_b1'
      ? 'Khatoni B-1 (Form 7)'
      : 'Land Record Document';

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', padding: '28px 20px' }}>
      <Toast toast={toast} />

      {/* Top bar */}
      <div style={{
        maxWidth: 1400, margin: '0 auto 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn-ghost" onClick={() => navigate('/upload')}>
            <ArrowLeft size={16} /> Upload Another
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f3f4f6', letterSpacing: '-0.01em' }}>
              Review Extracted Record
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: 2 }}>
              {docTypeLabel} · {filename} · Document ID: {documentId}
            </p>
          </div>
        </div>
        <button
          className="btn-success"
          onClick={handleSave}
          disabled={saving}
          style={{ minWidth: 180, justifyContent: 'center' }}
        >
          {saving
            ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
            : <><Save size={16} /> Save Record</>
          }
        </button>
      </div>

      {/* ── Main two-column layout ────────────────────────── */}
      <div style={{
        maxWidth: 1400, margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(340px, 1fr) minmax(0, 1.6fr)',
        gap: 24, alignItems: 'start'
      }}>

        {/* LEFT — Document preview */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 24 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ExternalLink size={15} color="#818cf8" />
              <span style={{ fontWeight: 600, color: '#e5e7eb', fontSize: '0.9rem' }}>Source Document</span>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.78rem', marginTop: 3 }}>{filename}</p>
          </div>

          {fileUrl ? (
            (fileType === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf')) ? (
              <iframe
                src={fileUrl}
                title="Document Preview"
                style={{ width: '100%', height: '82vh', border: 'none', display: 'block', background: '#0d1117' }}
              />
            ) : (
              <img
                src={fileUrl}
                alt="Document Preview"
                style={{ width: '100%', maxHeight: '82vh', objectFit: 'contain', display: 'block', background: '#0d1117' }}
              />
            )
          ) : (
            <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
              Preview not available
            </div>
          )}
        </div>

        {/* RIGHT — Editable form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Validation banner */}
          <ValidationBanner validation={validation} extractionMeta={extraction_meta} />

          {/* Extraction meta info strip */}
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap',
            padding: '10px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            fontSize: '0.8rem', color: '#9ca3af'
          }}>
            <span>Avg confidence: <strong style={{ color: '#c7d2fe' }}>{extraction_meta?.average_confidence ? (extraction_meta.average_confidence * 100).toFixed(1) + '%' : '—'}</strong></span>
            <span>Owners: <strong style={{ color: '#c7d2fe' }}>{extraction_meta?.owners_found ?? owners.length}</strong></span>
            <span>Parcels: <strong style={{ color: '#c7d2fe' }}>{extraction_meta?.parcels_found ?? parcels.length}</strong></span>
            {extraction_meta?.needs_review && (
              <span style={{ color: '#fbbf24' }}><AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />Needs Review</span>
            )}
          </div>

          {/* ── Khata Section ─────────────────────────────── */}
          <div className="glass-card" style={{ padding: 24 }}>
            <p className="section-label">Khata Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldRow label="CLRM No"         fieldKey="clrm_no"          value={khata.clrm_no?.value}          confidence={khata.clrm_no?.confidence}          onChange={updateKhata} />
              <FieldRow label="Khata Number"    fieldKey="khata_number"     value={khata.khata_number?.value}     confidence={khata.khata_number?.confidence}     onChange={updateKhata} />
              <FieldRow label="Village"         fieldKey="village"          value={khata.village?.value}          confidence={khata.village?.confidence}          onChange={updateKhata} />
              <FieldRow label="Tehsil"          fieldKey="tehsil"           value={khata.tehsil?.value}           confidence={khata.tehsil?.confidence}           onChange={updateKhata} />
              <FieldRow label="District"        fieldKey="district"         value={khata.district?.value}         confidence={khata.district?.confidence}         onChange={updateKhata} />
              <FieldRow label="Fasli Year"      fieldKey="fasli_year"       value={khata.fasli_year?.value}       confidence={khata.fasli_year?.confidence}       onChange={updateKhata} />
              <FieldRow label="Patwari Halka"   fieldKey="patwari_halka_no" value={khata.patwari_halka_no?.value} confidence={khata.patwari_halka_no?.confidence} onChange={updateKhata} />
              <FieldRow label="State"           fieldKey="state"            value={khata.state?.value}            confidence={khata.state?.confidence}            onChange={updateKhata} />
            </div>
          </div>

          {/* ── Owners Table ───────────────────────────────── */}
          <div className="glass-card" style={{ padding: 24 }}>
            <p className="section-label">Owners ({owners.length})</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 40 }}>#</th>
                    <th style={{ minWidth: 160 }}>Owner Name</th>
                    <th style={{ minWidth: 160 }}>Parent / Spouse</th>
                    <th style={{ minWidth: 80  }}>Share</th>
                    <th style={{ minWidth: 120 }}>Status</th>
                    <th style={{ minWidth: 60  }}>Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o, i) => (
                    <tr key={i}>
                      <td style={{ color: '#6b7280', fontSize: '0.8rem', paddingLeft: 12 }}>{i + 1}</td>
                      <td>
                        <input
                          className="table-input"
                          value={o.owner_name}
                          onChange={e => updateOwner(i, 'owner_name', e.target.value)}
                          style={{ minWidth: 140 }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={o.parent_or_spouse_name}
                          onChange={e => updateOwner(i, 'parent_or_spouse_name', e.target.value)}
                          style={{ minWidth: 140 }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={o.share_fraction}
                          onChange={e => updateOwner(i, 'share_fraction', e.target.value)}
                          style={{ maxWidth: 70 }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={o.ownership_status}
                          onChange={e => updateOwner(i, 'ownership_status', e.target.value)}
                          style={{ minWidth: 110 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ConfidenceBadge score={o._conf} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Parcels Table ──────────────────────────────── */}
          <div className="glass-card" style={{ padding: 24 }}>
            <p className="section-label">Parcels ({parcels.length})</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 40 }}>#</th>
                    <th style={{ minWidth: 100 }}>Survey No</th>
                    <th style={{ minWidth: 90  }}>Area (ha)</th>
                    <th style={{ minWidth: 90  }}>Land Use</th>
                    <th style={{ minWidth: 90  }}>Revenue (₹)</th>
                    <th style={{ minWidth: 40  }}>Flag</th>
                    <th style={{ minWidth: 60  }}>Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((p, i) => (
                    <tr key={i}>
                      <td style={{ color: '#6b7280', fontSize: '0.8rem', paddingLeft: 12 }}>{i + 1}</td>
                      <td>
                        <input
                          className="table-input"
                          value={p.survey_number}
                          onChange={e => updateParcel(i, 'survey_number', e.target.value)}
                          style={{ maxWidth: 110, fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={p.area_hectare}
                          onChange={e => updateParcel(i, 'area_hectare', e.target.value)}
                          type="number" step="0.0001"
                          style={{ maxWidth: 90 }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={p.land_use}
                          onChange={e => updateParcel(i, 'land_use', e.target.value)}
                          style={{ maxWidth: 90 }}
                        />
                      </td>
                      <td>
                        <input
                          className="table-input"
                          value={p.land_revenue_rs}
                          onChange={e => updateParcel(i, 'land_revenue_rs', e.target.value)}
                          type="number" step="0.01"
                          style={{ maxWidth: 90 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', fontSize: '0.75rem', fontWeight: 700,
                          padding: '1px 7px', borderRadius: 4,
                          background: p.land_use_flag === 'S' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                          color: p.land_use_flag === 'S' ? '#34d399' : '#fbbf24',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {p.land_use_flag || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <ConfidenceBadge score={p._conf} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 32 }}>
            <button
              className="btn-success"
              onClick={handleSave}
              disabled={saving}
              style={{ minWidth: 200, justifyContent: 'center', padding: '13px 32px', fontSize: '1rem' }}
            >
              {saving
                ? <><Loader2 size={18} className="animate-spin" /> Saving…</>
                : <><Save size={18} /> Save Record to Database</>
              }
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
