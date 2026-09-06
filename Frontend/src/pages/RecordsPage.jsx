import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Search, FileText, AlertTriangle, CheckCircle2,
  Clock, Copy, ChevronRight, RefreshCw, Loader2, X, Users, Layers
} from 'lucide-react';

/* ── Status Badge ──────────────────────────────────────────── */
function StatusBadge({ status, isDuplicate }) {
  if (isDuplicate) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: '0.7rem', fontWeight: 700,
        padding: '3px 8px', borderRadius: '999px',
        background: 'rgba(244,63,94,0.12)', color: '#f43f5e',
        border: '1px solid rgba(244,63,94,0.3)', whiteSpace: 'nowrap'
      }}>
        <Copy size={10} /> Duplicate
      </span>
    );
  }
  if (status === 'verified') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: '0.7rem', fontWeight: 700,
        padding: '3px 8px', borderRadius: '999px',
        background: 'rgba(16,185,129,0.12)', color: '#10b981',
        border: '1px solid rgba(16,185,129,0.3)', whiteSpace: 'nowrap'
      }}>
        <CheckCircle2 size={10} /> Verified
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.7rem', fontWeight: 700,
      padding: '3px 8px', borderRadius: '999px',
      background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
      border: '1px solid rgba(245,158,11,0.3)', whiteSpace: 'nowrap'
    }}>
      <Clock size={10} /> Pending
    </span>
  );
}

/* ── Empty State ─────────────────────────────────────────── */
function EmptyState({ filtered }) {
  return (
    <tr>
      <td colSpan={9} style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
        <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        <p style={{ fontWeight: 600, marginBottom: 4 }}>
          {filtered ? 'No records match your search' : 'No records saved yet'}
        </p>
        <p style={{ fontSize: '0.85rem' }}>
          {filtered ? 'Try a different village or district filter.' : 'Upload a document to get started.'}
        </p>
      </td>
    </tr>
  );
}

/* ── Main RecordsPage ───────────────────────────────────── */
export default function RecordsPage() {
  const navigate = useNavigate();

  const [records, setRecords]     = useState([]);
  const [total,   setTotal]       = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState(null);
  const [village, setVillage]     = useState('');
  const [district, setDistrict]   = useState('');
  const [searchVillage, setSearchVillage]   = useState('');
  const [searchDistrict, setSearchDistrict] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchRecords = useCallback(async (v = '', d = '') => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (v) params.village  = v;
      if (d) params.district = d;
      const res = await axios.get('/api/records', { params, timeout: 10000 });
      setRecords(res.data.records || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSearch = (e) => {
    e.preventDefault();
    setVillage(searchVillage);
    setDistrict(searchDistrict);
    fetchRecords(searchVillage, searchDistrict);
  };

  const clearFilters = () => {
    setSearchVillage('');
    setSearchDistrict('');
    setVillage('');
    setDistrict('');
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
      /* ignore */
    } finally {
      setUpdatingId(null);
    }
  };

  const isFiltered = !!(village || district);

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', padding: '28px 20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f3f4f6', letterSpacing: '-0.02em' }}>
              Records
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 3 }}>
              {total} khata record{total !== 1 ? 's' : ''} in database
              {isFiltered && ` · filtered`}
            </p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/upload')}>
            + Upload Document
          </button>
        </div>

        {/* Search / filter bar */}
        <form onSubmit={handleSearch} style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} />
            <input
              id="filter-village"
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Filter by village…"
              value={searchVillage}
              onChange={e => setSearchVillage(e.target.value)}
            />
          </div>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} />
            <input
              id="filter-district"
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Filter by district…"
              value={searchDistrict}
              onChange={e => setSearchDistrict(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" style={{ padding: '9px 20px' }}>
            <Search size={14} /> Search
          </button>
          {isFiltered && (
            <button type="button" className="btn-ghost" onClick={clearFilters} style={{ padding: '9px 14px' }}>
              <X size={14} /> Clear
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => fetchRecords(village, district)} style={{ padding: '9px 14px' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="validation-banner error" style={{ marginBottom: 16 }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Table */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Khata No.</th>
                  <th>CLRM No.</th>
                  <th>Village</th>
                  <th>Tehsil</th>
                  <th>District</th>
                  <th style={{ textAlign: 'center' }}>
                    <Users size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Owners
                  </th>
                  <th style={{ textAlign: 'center' }}>
                    <Layers size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Parcels
                  </th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px 20px', textAlign: 'center', color: '#6b7280' }}>
                      <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                      <p>Loading records…</p>
                    </td>
                  </tr>
                ) : records.length === 0 ? (
                  <EmptyState filtered={isFiltered} />
                ) : records.map(rec => (
                  <tr
                    key={rec.id}
                    style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                    onClick={() => navigate(`/records/${rec.id}`)}
                  >
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#818cf8' }}>
                        #{rec.id}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#e5e7eb', fontFamily: 'var(--font-mono)' }}>
                        {rec.khata_number || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#9ca3af' }}>
                        {rec.clrm_no || '—'}
                      </span>
                    </td>
                    <td style={{ color: '#d1d5db' }}>{rec.village || '—'}</td>
                    <td style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{rec.tehsil || '—'}</td>
                    <td style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{rec.district || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', borderRadius: 6, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600 }}>
                        {rec.owner_count}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', borderRadius: 6, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600 }}>
                        {rec.parcel_count}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        disabled={updatingId === rec.id}
                        onClick={() => toggleVerify(rec)}
                        title={rec.review_status === 'verified' ? 'Mark as Pending' : 'Mark as Verified'}
                      >
                        {updatingId === rec.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <StatusBadge status={rec.review_status} isDuplicate={rec.is_duplicate_flag} />
                        }
                      </button>
                    </td>
                    <td>
                      <ChevronRight size={16} color="#4b5563" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {records.length > 0 && (
          <p style={{ marginTop: 12, textAlign: 'right', color: '#6b7280', fontSize: '0.8rem' }}>
            Showing {records.length} of {total} record{total !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
