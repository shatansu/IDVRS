import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import axios from 'axios';
import {
  Server, Database, Table, CheckCircle2, XCircle,
  RefreshCw, Clock, ShieldCheck, FileText, Layers,
  UploadCloud, Eye
} from 'lucide-react';

import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';

/* ── Health-check page (Phase 1 original) ──────────────────── */
function HealthPage() {
  const [loading,     setLoading]     = useState(false);
  const [pingData,    setPingData]    = useState(null);
  const [error,       setError]       = useState(null);
  const [latency,     setLatency]     = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealthCheck = async () => {
    setLoading(true);
    setError(null);
    const startTime = performance.now();
    try {
      const res = await axios.get('/api/ping', { timeout: 5000 });
      setLatency(Math.round(performance.now() - startTime));
      setPingData(res.data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setLatency(Math.round(performance.now() - startTime));
      setError(err.message || 'Failed to connect to backend server');
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealthCheck(); }, []);

  const isBackendOnline = !!pingData && pingData.status === 'ok';
  const isDbConnected   = !!pingData?.database?.connected;
  const tables          = pingData?.tables || [];

  const requiredTables = [
    { name: 'documents',     desc: 'Raw document uploads, status, and OCR extracted texts' },
    { name: 'khatas',        desc: 'Account-level records (CLRM, Khata No, Village, Tehsil, District)' },
    { name: 'khata_owners',  desc: 'Co-owners, parent/spouse names, and fractional shares' },
    { name: 'khata_parcels', desc: 'Survey parcels, hectare areas, land use, and revenues' },
  ];

  return (
    <div style={{ minHeight: '100vh', padding: '36px 20px', maxWidth: '1160px', margin: '0 auto' }}>
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', border: '1px solid rgba(99,102,241,0.3)', letterSpacing: '0.05em' }}>SIH 26018 • DO&LR</span>
              <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399',  fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', border: '1px solid rgba(16,185,129,0.3)',  letterSpacing: '0.05em' }}>PHASE 5 ACTIVE</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f3f4f6' }}>
              Intelligent Land Record Digitization & Validation
            </h1>
            <p style={{ color: '#9ca3af', fontSize: '0.95rem', marginTop: '4px' }}>
              System Health Check • React + FastAPI + MySQL + Tesseract / Vision API
            </p>
          </div>
          <button onClick={fetchHealthCheck} disabled={loading} className="btn-primary" style={{ minWidth: '160px', justifyContent: 'center' }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Pinging...' : 'Test Connection'}
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {/* Backend card */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}><Server size={24} /></div>
              <div><h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f9fafb' }}>Backend Server</h3><p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>FastAPI • Python 3.11</p></div>
            </div>
            {isBackendOnline
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(16,185,129,0.3)' }}><span className="pulse-green" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />ONLINE</span>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(239,68,68,0.3)' }}><XCircle size={14} />OFFLINE</span>
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Endpoint</span><span className="code-font" style={{ color: '#e5e7eb' }}>/api/ping</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Host Target</span><span className="code-font" style={{ color: '#e5e7eb' }}>http://127.0.0.1:8000</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Response Latency</span><span className="code-font" style={{ color: latency ? '#34d399' : '#9ca3af' }}>{latency ? `${latency} ms` : '—'}</span></div>
          </div>
        </div>

        {/* DB card */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', color: '#34d399' }}><Database size={24} /></div>
              <div><h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f9fafb' }}>MySQL Database</h3><p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>MySQL 8.0 Server (Active)</p></div>
            </div>
            {isDbConnected
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(16,185,129,0.3)' }}><CheckCircle2 size={14} />CONNECTED</span>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(239,68,68,0.3)' }}><XCircle size={14} />DISCONNECTED</span>
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Database Name</span><span className="code-font" style={{ color: '#60a5fa' }}>{pingData?.database?.database || 'land_record_db'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Connection Port</span><span className="code-font" style={{ color: '#e5e7eb' }}>3306 (localhost)</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#9ca3af' }}>Encoding</span><span className="code-font" style={{ color: '#e5e7eb' }}>utf8mb4 (Hindi/Devanagari)</span></div>
          </div>
        </div>

        {/* Phase card */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}><Layers size={24} /></div>
              <div><h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f9fafb' }}>Pipeline Status</h3><p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>PRD Section 15 Compliance</p></div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: '0.8rem', fontWeight: 600, border: '1px solid rgba(99,102,241,0.3)' }}>PHASE 5 ACTIVE</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', fontSize: '0.85rem' }}>
            {[['Phase 1', 'Setup & DB Schema'], ['Phase 2', 'OCR + Text Extraction'], ['Phase 3', 'Field Extraction + Confidence'], ['Phase 4', 'Validation Rules'], ['Phase 5', 'Upload + Review UI']].map(([phase, desc]) => (
              <div key={phase} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>{phase}</span>
                <span style={{ color: '#34d399', fontWeight: 500 }}>{desc} ✓</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tables */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Table size={20} style={{ color: '#818cf8' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f3f4f6' }}>Relational Schema Verification (PRD Section 11)</h2>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{tables.length} of 4 Tables Active in MySQL</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {requiredTables.map(tbl => {
            const exists = tables.includes(tbl.name);
            return (
              <div key={tbl.name} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: exists ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="code-font" style={{ fontWeight: 600, color: exists ? '#34d399' : '#f87171', fontSize: '0.95rem' }}>{tbl.name}</span>
                  {exists ? <CheckCircle2 size={16} style={{ color: '#34d399' }} /> : <XCircle size={16} style={{ color: '#ef4444' }} />}
                </div>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.4 }}>{tbl.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live JSON */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: '#60a5fa' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f3f4f6' }}>Live Payload from Backend (GET /api/ping)</h3>
          </div>
          {lastChecked && <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Pinged at {lastChecked}</span>}
        </div>
        {error
          ? <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '14px', color: '#fca5a5', fontSize: '0.9rem' }}><strong>Connection Error:</strong> {error}</div>
          : <pre className="json-viewer">{pingData ? JSON.stringify(pingData, null, 2) : 'Awaiting response...'}</pre>
        }
      </div>
    </div>
  );
}

/* ── Global Nav ─────────────────────────────────────────────── */
function Layout({ children }) {
  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(11,15,25,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#818cf8', marginRight: 16, letterSpacing: '-0.01em' }}>
          IDVRS
        </span>
        <NavLink to="/"       className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <Server size={14} /> Health
        </NavLink>
        <NavLink to="/upload" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <UploadCloud size={14} /> Upload
        </NavLink>
        <NavLink to="/review" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')} style={{ pointerEvents: 'none', opacity: 0.4 }}>
          <Eye size={14} /> Review
        </NavLink>
      </nav>
      {children}
    </>
  );
}

/* ── App root ───────────────────────────────────────────────── */
export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"       element={<HealthPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="*"       element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
