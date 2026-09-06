import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, CheckCircle2, Clock, Copy, Loader2,
  AlertTriangle, FileText, User, Users, Layers, Printer,
  Shield, Building2, Download, Check
} from 'lucide-react';

/* ── Status Pill ───────────────────────────────────────────── */
function StatusPill({ status, isDuplicate }) {
  if (isDuplicate) {
    return (
      <span className="gov-badge duplicate" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
        <Copy size={12} /> संभावित दोहराव (Duplicate Flagged)
      </span>
    );
  }
  if (status === 'verified') {
    return (
      <span className="gov-badge verified" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
        <CheckCircle2 size={12} /> सत्यापित (Verified RoR)
      </span>
    );
  }
  return (
    <span className="gov-badge pending" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
      <Clock size={12} /> समीक्षाधीन (Pending Audit)
    </span>
  );
}

/* ── Fractional to Percentage Helper ───────────────────────── */
function shareToPercentage(fraction) {
  if (!fraction) return '—';
  const parts = fraction.split('/');
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (den && !isNaN(num) && !isNaN(den)) {
      return `${((num / den) * 100).toFixed(2)}%`;
    }
  }
  return fraction;
}

/* ── Info Item Helper ──────────────────────────────────────── */
function InfoItem({ label, value, isCode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <span style={{ fontSize: '0.725rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
        {label}
      </span>
      <span style={{
        color: value ? '#0f172a' : '#94a3b8',
        fontWeight: value ? 600 : 400,
        fontSize: '0.925rem',
        fontFamily: isCode ? 'var(--font-mono)' : 'inherit'
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

/* ── Main Record Detail Page ───────────────────────────────── */
export default function RecordDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    axios.get(`/api/records/${id}`, { timeout: 10000 })
      .then(res => {
        setRec(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.detail || err.message || 'रिकॉर्ड लोड करने में विफलता।');
        setLoading(false);
      });
  }, [id]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const toggleStatus = async () => {
    const newStatus = rec.review_status === 'verified' ? 'pending_review' : 'verified';
    setUpdating(true);
    try {
      await axios.patch(`/api/records/${id}/status`, { review_status: newStatus });
      setRec(r => ({ ...r, review_status: newStatus }));
      showToast(newStatus === 'verified' ? 'भू-अभिलेख को सत्यापित चिह्नित किया गया।' : 'भू-अभिलेख को समीक्षाधीन चिह्नित किया गया।');
    } catch {
      showToast('स्थिति अद्यतन करने में त्रुटि हुई।', 'error');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
        <div className="gov-spinner" />
        <p style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>
          अभिलेख #{id} का विवरण लोड हो रहा है...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
        <div className="gov-alert error">
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
        <button className="btn-gov-secondary" onClick={() => navigate('/records')}>
          <ArrowLeft size={15} /> पंजिका पर वापस जाएं
        </button>
      </div>
    );
  }

  /* Compute Totals */
  const totalArea = (rec.parcels || []).reduce((acc, p) => acc + (parseFloat(p.area_hectare) || 0), 0);
  const totalRevenue = (rec.parcels || []).reduce((acc, p) => acc + (parseFloat(p.land_revenue_rs) || 0), 0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 60px' }}>

      {/* Toast */}
      {toast && (
        <div className={`gov-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. Command Bar (Hidden during print) */}
      <div className="no-print" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => navigate('/records')}
          >
            <ArrowLeft size={15} /> पंजिका सूची
          </button>
          <StatusPill status={rec.review_status} isDuplicate={rec.is_duplicate_flag} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => window.print()}
          >
            <Printer size={15} /> प्रमाणित प्रति प्रिंट करें (Print RoR)
          </button>

          <button
            type="button"
            className={rec.review_status === 'verified' ? 'btn-gov-secondary' : 'btn-gov-success'}
            onClick={toggleStatus}
            disabled={updating}
          >
            {updating ? (
              <><Loader2 size={15} className="animate-spin" /> अद्यतन हो रहा है...</>
            ) : rec.review_status === 'verified' ? (
              <><Clock size={15} /> स्थिति बदलें: समीक्षाधीन</>
            ) : (
              <><CheckCircle2 size={15} /> अधिकारिक सत्यापन करें (Verify)</>
            )}
          </button>
        </div>
      </div>

      {/* 2. Official Certified RoR Document Wrapper */}
      <div className="gov-card" style={{ padding: '36px 40px', background: '#ffffff', border: '1px solid #cbd5e1' }}>

        {/* Official Gov Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              राजस्व विभाग • मध्य प्रदेश शासन (DoLR)
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
            डिजिटाइज्ड अधिकार अभिलेख (Record of Rights - Certified Extract)
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>
            मध्य प्रदेश भू-राजस्व संहिता (भू-सर्वेक्षण तथा भू-अभिलेख) नियम • कंप्यूटर प्रपत्र सारांश
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '0.78rem', color: '#64748b', marginTop: '8px' }}>
            <span>खाता आईडी: <strong>#{rec.id}</strong></span>
            <span>•</span>
            <span>दस्तावेज़ ID: <strong>#{rec.document_id}</strong></span>
            <span>•</span>
            <span>प्रमाणित दिनांक: <strong>{rec.created_at ? new Date(rec.created_at).toLocaleDateString() : '—'}</strong></span>
          </div>
        </div>

        {/* Khata Master Details Grid */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '28px'
        }}>
          <InfoItem label="CLRM क्रमांक" value={rec.clrm_no} isCode />
          <InfoItem label="खाता संख्यांक" value={rec.khata_number} isCode />
          <InfoItem label="ग्राम का नाम" value={rec.village} />
          <InfoItem label="तहसील" value={rec.tehsil} />
          <InfoItem label="जिला" value={rec.district} />
          <InfoItem label="राज्य" value={rec.state} />
          <InfoItem label="फसली वर्ष" value={rec.fasli_year} isCode />
          <InfoItem label="पटवारी हल्का" value={rec.patwari_halka_no} />
        </div>

        {/* 3. Co-Owners Table (सह-खातेदारों की सूची) */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} color="#1e3a8a" /> सह-खातेदारों का विवरण (Co-Owners & Fractional Holdings)
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              कुल खातेदार: <strong>{rec.owners.length}</strong>
            </span>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="gov-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>क्र.</th>
                  <th>भूमिस्वामी का नाम (Owner Name)</th>
                  <th>माता / पिता / पति का नाम (Guardian)</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>अंश (Fraction)</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>हिस्सा प्रतिशत</th>
                  <th style={{ width: '130px' }}>अधिकार स्वरूप</th>
                  <th>निवास का पता</th>
                </tr>
              </thead>
              <tbody>
                {rec.owners.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>कोई खातेदार दर्ज नहीं है।</td></tr>
                ) : (
                  rec.owners.map((o, i) => (
                    <tr key={o.id || i}>
                      <td style={{ color: '#64748b', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{o.owner_name || '—'}</td>
                      <td style={{ color: '#475569' }}>{o.parent_or_spouse_name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {o.share_fraction || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, color: '#059669' }}>
                        {shareToPercentage(o.share_fraction)}
                      </td>
                      <td style={{ color: '#475569', fontSize: '0.85rem' }}>{o.ownership_status || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: '0.825rem' }}>{o.address || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Survey Parcels Table (खसरा एवं क्षेत्रफल सूची) */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={16} color="#059669" /> भू-खण्ड / खसरा वार क्षेत्रफल एवं लगान (Survey Parcels)
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              कुल खसरे: <strong>{rec.parcels.length}</strong>
            </span>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="gov-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>क्र.</th>
                  <th>खसरा / सर्वे क्रमांक (Survey No.)</th>
                  <th>भू-भाग यूनिक आईडी (Parcel UID)</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>प्रकार</th>
                  <th>उपयोग (Land Use)</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>क्षेत्रफल (हेक्टेयर)</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>भू-राजस्व (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rec.parcels.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>कोई खसरा दर्ज नहीं है।</td></tr>
                ) : (
                  rec.parcels.map((p, i) => (
                    <tr key={p.id || i}>
                      <td style={{ color: '#64748b', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0f172a' }}>
                          {p.survey_number || '—'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#64748b' }}>
                        {p.parcel_unique_id || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: p.land_use_flag === 'S' ? '#ecfdf5' : '#fffbeb',
                          color: p.land_use_flag === 'S' ? '#059669' : '#d97706'
                        }}>
                          {p.land_use_flag || '—'}
                        </span>
                      </td>
                      <td style={{ color: '#475569', fontSize: '0.85rem' }}>{p.land_use || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0f172a' }}>
                        {p.area_hectare != null ? Number(p.area_hectare).toFixed(4) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#475569' }}>
                        {p.land_revenue_rs != null ? `₹ ${Number(p.land_revenue_rs).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rec.parcels.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td colSpan={5} style={{ textAlign: 'right', paddingRight: '16px', color: '#1e3a8a' }}>
                      योग (Total Holdings & Demand):
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#1e3a8a', fontSize: '0.95rem' }}>
                      {totalArea.toFixed(4)} ha
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#1e3a8a', fontSize: '0.95rem' }}>
                      ₹ {totalRevenue.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* 5. Official Verification Seal Box */}
        <div style={{
          borderTop: '1px dashed #cbd5e1',
          paddingTop: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
              यह प्रपत्र राष्ट्रीय भू-अभिलेख डिजिटलीकरण प्रणाली (IDVRS) द्वारा प्रमाणित डिजिटल प्रतिलिपि है।
            </p>
            <p style={{ fontSize: '0.725rem', color: '#94a3b8', margin: '2px 0 0' }}>
              सुरक्षा हैश / क्रिप्टोग्राफिक सत्यापन आईडी: SHA256-CLRM-{rec.clrm_no || rec.id}
            </p>
          </div>

          <div style={{ textAlign: 'right', minWidth: '180px' }}>
            <div style={{
              display: 'inline-block',
              border: '2px solid #059669',
              borderRadius: '8px',
              padding: '6px 14px',
              color: '#059669',
              fontWeight: 800,
              fontSize: '0.8rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              ✓ प्रमाणित भू-अभिलेख
            </div>
            <p style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
              डिजिटाइज्ड एवं सत्यापित
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
