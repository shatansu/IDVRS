import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Search, FileText, AlertTriangle, CheckCircle2,
  Clock, Copy, ChevronRight, RefreshCw, Loader2,
  Download, Filter, Users, Layers, ShieldCheck, X
} from 'lucide-react';

/* ── Status Badge ──────────────────────────────────────────── */
function StatusBadge({ status, isDuplicate }) {
  if (isDuplicate) {
    return (
      <span className="gov-badge duplicate">
        <Copy size={11} /> संभावित दोहराव (Duplicate)
      </span>
    );
  }
  if (status === 'verified') {
    return (
      <span className="gov-badge verified">
        <CheckCircle2 size={11} /> सत्यापित (Verified)
      </span>
    );
  }
  return (
    <span className="gov-badge pending">
      <Clock size={11} /> समीक्षाधीन (Pending)
    </span>
  );
}

/* ── CSV Export Function ───────────────────────────────────── */
function exportRecordsToCSV(records) {
  if (!records || records.length === 0) {
    alert('डाउनलोड करने हेतु कोई रिकॉर्ड उपलब्ध नहीं है।');
    return;
  }

  const headers = [
    'ID', 'Khata_Number', 'CLRM_No', 'Village', 'Tehsil',
    'District', 'State', 'Fasli_Year', 'Review_Status',
    'Is_Duplicate', 'Owner_Count', 'Parcel_Count', 'Primary_Owner', 'Created_At'
  ];

  const rows = records.map(r => [
    r.id,
    `"${r.khata_number || ''}"`,
    `"${r.clrm_no || ''}"`,
    `"${r.village || ''}"`,
    `"${r.tehsil || ''}"`,
    `"${r.district || ''}"`,
    `"${r.state || ''}"`,
    `"${r.fasli_year || ''}"`,
    r.review_status,
    r.is_duplicate_flag ? 'YES' : 'NO',
    r.owner_count,
    r.parcel_count,
    `"${r.primary_owner || ''}"`,
    r.created_at || ''
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' +
    [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `IDVRS_Land_Records_Export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ── Main RecordsPage ──────────────────────────────────────── */
export default function RecordsPage() {
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* Filters */
  const [searchVillage, setSearchVillage] = useState('');
  const [searchDistrict, setSearchDistrict] = useState('');
  const [activeVillage, setActiveVillage] = useState('');
  const [activeDistrict, setActiveDistrict] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, verified, pending, duplicate
  const [updatingId, setUpdatingId] = useState(null);

  const fetchRecords = useCallback(async (v = '', d = '') => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (v) params.village = v;
      if (d) params.district = d;
      const res = await axios.get('/api/records', { params, timeout: 10000 });
      setRecords(res.data.records || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'भू-अभिलेख सूची लोड करने में असमर्थ।');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleSearch = (e) => {
    e.preventDefault();
    setActiveVillage(searchVillage);
    setActiveDistrict(searchDistrict);
    fetchRecords(searchVillage, searchDistrict);
  };

  const clearFilters = () => {
    setSearchVillage('');
    setSearchDistrict('');
    setActiveVillage('');
    setActiveDistrict('');
    setStatusFilter('all');
    fetchRecords('', '');
  };

  const toggleVerify = async (rec) => {
    const newStatus = rec.review_status === 'verified' ? 'pending_review' : 'verified';
    setUpdatingId(rec.id);
    try {
      await axios.patch(`/api/records/${rec.id}/status`, { review_status: newStatus });
      setRecords(prev =>
        prev.map(r => r.id === rec.id ? { ...r, review_status: newStatus } : r)
      );
    } catch {
      alert('स्थिति अद्यतन करने में विफलता हुई।');
    } finally {
      setUpdatingId(null);
    }
  };

  /* Filter in memory by status tab */
  const filteredRecords = records.filter(r => {
    if (statusFilter === 'verified') return r.review_status === 'verified';
    if (statusFilter === 'pending') return r.review_status === 'pending_review';
    if (statusFilter === 'duplicate') return r.is_duplicate_flag;
    return true;
  });

  const isFiltered = !!(activeVillage || activeDistrict || statusFilter !== 'all');

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px 60px' }}>

      {/* 1. Header & Title Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        background: '#ffffff',
        padding: '24px 28px',
        borderRadius: '12px',
        border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="gov-badge info">
              <ShieldCheck size={12} /> आधिकारिक लैंड रिकॉर्ड रजिस्ट्री
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              • कुल {total} पंजीकृत खाते (MySQL)
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            राष्ट्रीय भू-अभिलेख पंजिका (Land Records Registry)
          </h1>
          <p style={{ color: '#475569', fontSize: '0.9rem', marginTop: '4px' }}>
            डिजिटाइज्ड खातों की आधिकारिक सूची, सह-खातेदारों का विवरण एवं सत्यापित खसरों का केंद्रीय भंडार
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => exportRecordsToCSV(records)}
            title="CSV प्रारूप में डाउनलोड करें"
          >
            <Download size={15} /> CSV निर्यात करें (Export)
          </button>
          <button
            type="button"
            className="btn-gov-primary"
            onClick={() => navigate('/upload')}
          >
            + नया दस्तावेज़ जोड़ें
          </button>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="gov-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>

          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'सभी अभिलेख (All)', count: records.length },
              { id: 'verified', label: 'सत्यापित (Verified)', count: records.filter(r => r.review_status === 'verified').length },
              { id: 'pending', label: 'समीक्षाधीन (Pending)', count: records.filter(r => r.review_status === 'pending_review').length },
              { id: 'duplicate', label: 'दोहराव अलर्ट (Duplicate)', count: records.filter(r => r.is_duplicate_flag).length },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  background: statusFilter === tab.id ? '#1e3a8a' : '#f1f5f9',
                  color: statusFilter === tab.id ? '#ffffff' : '#475569',
                  border: '1px solid',
                  borderColor: statusFilter === tab.id ? '#1e3a8a' : '#e2e8f0',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  fontSize: '0.725rem',
                  background: statusFilter === tab.id ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                  color: statusFilter === tab.id ? '#ffffff' : '#64748b',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Inputs */}
          <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: '1 1 340px', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: '160px', flex: '1 1 140px' }}>
              <input
                className="gov-input"
                placeholder="ग्राम से खोजें (Village)..."
                value={searchVillage}
                onChange={e => setSearchVillage(e.target.value)}
                style={{ padding: '7px 12px', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ minWidth: '160px', flex: '1 1 140px' }}>
              <input
                className="gov-input"
                placeholder="जिले से खोजें (District)..."
                value={searchDistrict}
                onChange={e => setSearchDistrict(e.target.value)}
                style={{ padding: '7px 12px', fontSize: '0.85rem' }}
              />
            </div>

            <button type="submit" className="btn-gov-primary" style={{ padding: '7px 14px', fontSize: '0.85rem' }}>
              <Search size={14} /> खोजें
            </button>

            {isFiltered && (
              <button type="button" className="btn-gov-secondary" onClick={clearFilters} style={{ padding: '7px 12px', fontSize: '0.85rem' }}>
                <X size={14} /> रीसेट
              </button>
            )}

            <button type="button" className="btn-gov-secondary" onClick={() => fetchRecords(activeVillage, activeDistrict)} style={{ padding: '7px 10px' }} title="ताज़ा करें">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </form>

        </div>
      </div>

      {/* 3. Error Alert */}
      {error && (
        <div className="gov-alert error">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {/* 4. Table */}
      <div className="gov-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="gov-table-container">
          <table className="gov-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>ID</th>
                <th style={{ width: '110px' }}>खाता सं. (Khata)</th>
                <th>CLRM क्रमांक (Unique ID)</th>
                <th>ग्राम (Village)</th>
                <th>तहसील / जिला</th>
                <th>मुख्य खातेदार (Primary Owner)</th>
                <th style={{ textAlign: 'center', width: '85px' }}>
                  <Users size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />खातेदार
                </th>
                <th style={{ textAlign: 'center', width: '85px' }}>
                  <Layers size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />खसरे
                </th>
                <th style={{ width: '160px' }}>स्थिति (Status)</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <div className="gov-spinner" style={{ margin: '0 auto 12px' }} />
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>डेटाबेस से भू-अभिलेख लोड हो रहे हैं...</p>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <p style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>
                      {isFiltered ? 'खोज से मेल खाता कोई भू-अभिलेख नहीं मिला' : 'डेटाबेस में कोई रिकॉर्ड दर्ज नहीं है'}
                    </p>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
                      {isFiltered ? 'कृपया अन्य ग्राम अथवा जिला नाम डालकर पुनः प्रयास करें।' : 'शुरू करने के लिए ऊपर दिए बटन से नया दस्तावेज़ अपलोड करें।'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map(rec => (
                  <tr
                    key={rec.id}
                    onClick={() => navigate(`/records/${rec.id}`)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                  >
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600, color: '#1e3a8a' }}>
                        #{rec.id}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0f172a', fontSize: '0.925rem' }}>
                        {rec.khata_number || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#475569' }}>
                        {rec.clrm_no || '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                      {rec.village || '—'}
                    </td>
                    <td style={{ color: '#475569', fontSize: '0.85rem' }}>
                      {rec.tehsil ? `${rec.tehsil}, ` : ''}{rec.district || '—'}
                    </td>
                    <td>
                      <span style={{ fontWeight: 500, color: '#1e293b' }}>
                        {rec.primary_owner || '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {rec.owner_count}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        background: '#f0fdf4',
                        color: '#15803d',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {rec.parcel_count}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleVerify(rec)}
                        disabled={updatingId === rec.id}
                        title={rec.review_status === 'verified' ? 'समीक्षाधीन में बदलें' : 'सत्यापित करें'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {updatingId === rec.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <StatusBadge status={rec.review_status} isDuplicate={rec.is_duplicate_flag} />
                        )}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right', color: '#94a3b8' }}>
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredRecords.length > 0 && (
          <div style={{
            padding: '12px 20px',
            background: '#fafafa',
            borderTop: '1px solid var(--border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: '#64748b'
          }}>
            <span>
              प्रदर्शित: <strong>{filteredRecords.length}</strong> / <strong>{total}</strong> कुल खाते
            </span>
            <span>
              क्लिक करके संपूर्ण अधिकार अभिलेख (Record of Rights) देखें
            </span>
          </div>
        )}
      </div>

    </div>
  );
}
