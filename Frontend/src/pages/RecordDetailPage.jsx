import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, CheckCircle2, Clock, Copy, Loader2,
  AlertTriangle, FileText, User, Layers, Save
} from 'lucide-react';

/* ── Status pill ──────────────────────────────────────────── */
function StatusPill({ status, isDuplicate }) {
  if (isDuplicate) return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:700, padding:'4px 10px', borderRadius:999, background:'rgba(244,63,94,0.12)', color:'#f43f5e', border:'1px solid rgba(244,63,94,0.3)' }}>
      <Copy size={11}/> Duplicate Record
    </span>
  );
  if (status === 'verified') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:700, padding:'4px 10px', borderRadius:999, background:'rgba(16,185,129,0.12)', color:'#10b981', border:'1px solid rgba(16,185,129,0.3)' }}>
      <CheckCircle2 size={11}/> Verified
    </span>
  );
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'0.75rem', fontWeight:700, padding:'4px 10px', borderRadius:999, background:'rgba(245,158,11,0.12)', color:'#f59e0b', border:'1px solid rgba(245,158,11,0.3)' }}>
      <Clock size={11}/> Pending Review
    </span>
  );
}

/* ── Info row helper ──────────────────────────────────────── */
function InfoRow({ label, value }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
      <span style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#6b7280' }}>{label}</span>
      <span style={{ color: value ? '#e5e7eb' : '#4b5563', fontWeight: value ? 500 : 400, fontSize:'0.9rem' }}>
        {value || '—'}
      </span>
    </div>
  );
}

/* ── Main RecordDetailPage ────────────────────────────────── */
export default function RecordDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [rec,       setRec]       = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [updating,  setUpdating]  = useState(false);
  const [toast,     setToast]     = useState(null);

  useEffect(() => {
    axios.get(`/api/records/${id}`, { timeout: 10000 })
      .then(res => { setRec(res.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.detail || err.message); setLoading(false); });
  }, [id]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const toggleStatus = async () => {
    const newStatus = rec.review_status === 'verified' ? 'pending_review' : 'verified';
    setUpdating(true);
    try {
      await axios.patch(`/api/records/${id}/status`, { review_status: newStatus });
      setRec(r => ({ ...r, review_status: newStatus }));
      showToast(`Marked as ${newStatus === 'verified' ? 'Verified' : 'Pending Review'}`);
    } catch {
      showToast('Failed to update status.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  /* ── Loading / Error ─────────────────────────────────── */
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <Loader2 size={36} className="animate-spin" style={{ color:'#6366f1' }} />
      <p style={{ color:'#6b7280' }}>Loading record #{id}…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:'100vh', padding:'40px 20px' }}>
      <div className="validation-banner error" style={{ maxWidth:600, margin:'0 auto' }}>
        <AlertTriangle size={18} /> {error}
      </div>
      <div style={{ textAlign:'center', marginTop:24 }}>
        <button className="btn-ghost" onClick={() => navigate('/records')}><ArrowLeft size={14}/> Back to Records</button>
      </div>
    </div>
  );

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ minHeight:'100vh', padding:'28px 20px' }}>
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>}
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Top bar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <button className="btn-ghost" onClick={() => navigate('/records')}>
              <ArrowLeft size={15}/> Records
            </button>
            <div>
              <h1 style={{ fontSize:'1.4rem', fontWeight:800, color:'#f3f4f6', letterSpacing:'-0.01em' }}>
                Khata #{rec.khata_number || rec.id}
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:400, fontSize:'0.85rem', color:'#6b7280', marginLeft:10 }}>
                  ID: {rec.id}
                </span>
              </h1>
              <p style={{ color:'#6b7280', fontSize:'0.82rem', marginTop:2 }}>
                {rec.village} · {rec.tehsil} · {rec.district}
              </p>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <StatusPill status={rec.review_status} isDuplicate={rec.is_duplicate_flag} />
            <button
              className={rec.review_status === 'verified' ? 'btn-ghost' : 'btn-success'}
              onClick={toggleStatus}
              disabled={updating}
              style={{ minWidth:140, justifyContent:'center' }}
            >
              {updating
                ? <><Loader2 size={14} className="animate-spin"/> Updating…</>
                : rec.review_status === 'verified'
                  ? <><Clock size={14}/> Mark Pending</>
                  : <><CheckCircle2 size={14}/> Mark Verified</>
              }
            </button>
          </div>
        </div>

        {/* Khata metadata card */}
        <div className="glass-card" style={{ padding:24, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
            <FileText size={16} color="#818cf8"/>
            <span style={{ fontWeight:700, color:'#e5e7eb', fontSize:'0.95rem' }}>Khata Details</span>
            {rec.document_filename && (
              <span style={{ marginLeft:'auto', fontSize:'0.75rem', color:'#6b7280' }}>
                Source: {rec.document_filename}
              </span>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:20 }}>
            <InfoRow label="CLRM No." value={rec.clrm_no} />
            <InfoRow label="Khata Number" value={rec.khata_number} />
            <InfoRow label="Village" value={rec.village} />
            <InfoRow label="Tehsil" value={rec.tehsil} />
            <InfoRow label="District" value={rec.district} />
            <InfoRow label="State" value={rec.state} />
            <InfoRow label="Fasli Year" value={rec.fasli_year} />
            <InfoRow label="Patwari Halka" value={rec.patwari_halka_no} />
            <InfoRow label="Saved At" value={rec.created_at ? new Date(rec.created_at).toLocaleString() : null} />
          </div>
        </div>

        {/* Owners card */}
        <div className="glass-card" style={{ padding:0, overflow:'hidden', marginBottom:20 }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:8 }}>
            <User size={15} color="#34d399"/>
            <span style={{ fontWeight:700, color:'#e5e7eb', fontSize:'0.95rem' }}>
              Owners <span style={{ color:'#6b7280', fontWeight:400, fontSize:'0.85rem' }}>({rec.owners.length})</span>
            </span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Owner Name</th>
                  <th>Parent / Spouse</th>
                  <th>Share</th>
                  <th>Status</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {rec.owners.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding:'24px', textAlign:'center', color:'#6b7280' }}>No owners recorded.</td></tr>
                ) : rec.owners.map((o, i) => (
                  <tr key={o.id}>
                    <td style={{ color:'#6b7280', fontFamily:'var(--font-mono)', fontSize:'0.78rem' }}>{i + 1}</td>
                    <td style={{ fontWeight:600, color:'#e5e7eb' }}>{o.owner_name || '—'}</td>
                    <td style={{ color:'#9ca3af' }}>{o.parent_or_spouse_name || '—'}</td>
                    <td>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem', background:'rgba(99,102,241,0.1)', color:'#818cf8', borderRadius:5, padding:'2px 7px' }}>
                        {o.share_fraction || '—'}
                      </span>
                    </td>
                    <td style={{ color:'#9ca3af', fontSize:'0.82rem' }}>{o.ownership_status || '—'}</td>
                    <td style={{ color:'#6b7280', fontSize:'0.82rem' }}>{o.address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Parcels card */}
        <div className="glass-card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:8 }}>
            <Layers size={15} color="#f59e0b"/>
            <span style={{ fontWeight:700, color:'#e5e7eb', fontSize:'0.95rem' }}>
              Parcels <span style={{ color:'#6b7280', fontWeight:400, fontSize:'0.85rem' }}>({rec.parcels.length})</span>
            </span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Survey No.</th>
                  <th>Land Use Flag</th>
                  <th>Land Use</th>
                  <th style={{ textAlign:'right' }}>Area (ha)</th>
                  <th style={{ textAlign:'right' }}>Revenue (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rec.parcels.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding:'24px', textAlign:'center', color:'#6b7280' }}>No parcels recorded.</td></tr>
                ) : rec.parcels.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ color:'#6b7280', fontFamily:'var(--font-mono)', fontSize:'0.78rem' }}>{i + 1}</td>
                    <td>
                      <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'#e5e7eb' }}>{p.survey_number || '—'}</span>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {p.land_use_flag ? (
                        <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.8rem',
                          background: p.land_use_flag === 'S' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                          color: p.land_use_flag === 'S' ? '#10b981' : '#f59e0b',
                          borderRadius:5, padding:'2px 8px'
                        }}>
                          {p.land_use_flag}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ color:'#9ca3af', fontSize:'0.85rem' }}>{p.land_use || '—'}</td>
                    <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.85rem', color:'#d1d5db' }}>
                      {p.area_hectare != null ? Number(p.area_hectare).toFixed(4) : '—'}
                    </td>
                    <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.85rem', color:'#d1d5db' }}>
                      {p.land_revenue_rs != null ? Number(p.land_revenue_rs).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
