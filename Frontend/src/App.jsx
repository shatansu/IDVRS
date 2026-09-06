import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import axios from 'axios';
import {
  FileText, UploadCloud, BarChart3, Database,
  CheckCircle2, AlertCircle, Shield, ExternalLink, HelpCircle, Map
} from 'lucide-react';

import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import ReviewPage from './pages/ReviewPage';
import RecordsPage from './pages/RecordsPage';
import RecordDetailPage from './pages/RecordDetailPage';
import GISPage from './pages/GISPage';

/* ── National GovTech Layout Component ──────────────────────── */
function GovLayout({ children }) {
  const [systemStatus, setSystemStatus] = useState({
    online: true,
    db: true,
    latency: 12,
    lastChecked: null,
  });

  // Background health monitor
  useEffect(() => {
    const checkHealth = async () => {
      const start = performance.now();
      try {
        const res = await axios.get('/api/ping', { timeout: 4000 });
        const latency = Math.round(performance.now() - start);
        if (res.data?.status === 'ok') {
          setSystemStatus({
            online: true,
            db: !!res.data.database?.connected,
            latency,
            lastChecked: new Date().toLocaleTimeString(),
          });
        }
      } catch {
        setSystemStatus(prev => ({
          ...prev,
          online: false,
          lastChecked: new Date().toLocaleTimeString(),
        }));
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 1. National Tricolor Top Line */}
      <div className="tricolor-ribbon" />

      {/* 2. Official Ministry Top Bar */}
      <div style={{
        background: '#09101f',
        color: '#94a3b8',
        fontSize: '0.75rem',
        padding: '6px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ color: '#f8fafc', fontWeight: 600, letterSpacing: '0.02em' }}>
            भारत सरकार | Government of India
          </span>
          <span style={{ color: '#475569' }}>•</span>
          <span>ग्रामीण विकास मंत्रालय (DoLR)</span>
          <span style={{ color: '#475569' }}>•</span>
          <span style={{
            background: 'rgba(255, 153, 51, 0.15)',
            color: '#ffb066',
            padding: '1px 7px',
            borderRadius: '4px',
            fontWeight: 600
          }}>
            SIH 26018 Prototype
          </span>
        </div>

        {/* Live System Connectivity Micro-Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {systemStatus.online ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#34d399',
              fontSize: '0.725rem',
              fontWeight: 500
            }}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.7)'
              }} className="pulse-active" />
              AI Engine & MySQL Connected ({systemStatus.latency}ms)
            </span>
          ) : (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#f87171',
              fontSize: '0.725rem'
            }}>
              <AlertCircle size={12} /> Server Reconnecting
            </span>
          )}
        </div>
      </div>

      {/* 3. Main Government Portal Header */}
      <header style={{
        background: '#0c162c',
        borderBottom: '1px solid #1e293b',
        boxShadow: 'var(--shadow-sm)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Logo & Portal Identity */}
          <NavLink to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)'
            }}>
              <Shield size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                  IDVRS
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.12)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: '1px solid rgba(56, 189, 248, 0.25)'
                }}>
                  DILRMP AI
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0, fontWeight: 500 }}>
                राष्ट्रीय भू-अभिलेख डिजिटलीकरण एवं सत्यापन प्रणाली
              </p>
            </div>
          </NavLink>

          {/* Primary Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? 'gov-nav-active' : 'gov-nav-idle'
              }
            >
              <BarChart3 size={15} /> डैशबोर्ड (Dashboard)
            </NavLink>

            <NavLink
              to="/upload"
              className={({ isActive }) =>
                isActive ? 'gov-nav-active' : 'gov-nav-idle'
              }
            >
              <UploadCloud size={15} /> नया दस्तावेज़ डिजिटाइज़ (Digitize)
            </NavLink>

            <NavLink
              to="/records"
              className={({ isActive }) =>
                isActive ? 'gov-nav-active' : 'gov-nav-idle'
              }
            >
              <Database size={15} /> भू-अभिलेख पंजिका (Land Registry)
            </NavLink>

            <NavLink
              to="/gis"
              className={({ isActive }) =>
                isActive ? 'gov-nav-active' : 'gov-nav-idle'
              }
            >
              <Map size={15} /> भू-नक्शा (Cadastral Map)
            </NavLink>
          </nav>
        </div>
      </header>

      {/* 4. Main Page Canvas */}
      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* 5. Official National Portal Footer */}
      <footer style={{
        background: '#09101f',
        borderTop: '1px solid #1e293b',
        color: '#64748b',
        fontSize: '0.8rem',
        padding: '28px 24px 20px',
        marginTop: 'auto'
      }} className="no-print">
        <div style={{
          maxWidth: '1440px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <p style={{ color: '#94a3b8', fontWeight: 600 }}>
              National Land Record Digitization & Validation System (IDVRS)
            </p>
            <p style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
              Built for Smart India Hackathon (SIH 26018) • Ministry of Rural Development, Department of Land Resources (DoLR)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '20px', fontSize: '0.75rem' }}>
            <span>Madhya Pradesh Bhulekh Grounded Engine</span>
            <span>•</span>
            <span>Unicode NFC & Indic OCR Compliant</span>
            <span>•</span>
            <span>DILRMP Standards</span>
          </div>
        </div>
      </footer>

      {/* In-layout Nav Style Helper */}
      <style>{`
        .gov-nav-idle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 500;
          padding: 8px 14px;
          border-radius: 8px;
          transition: all 0.15s ease;
        }
        .gov-nav-idle:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.06);
        }
        .gov-nav-active {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #ffffff;
          background: #1e3a8a;
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}

/* ── App Root Router ────────────────────────────────────────── */
export default function App() {
  return (
    <BrowserRouter>
      <GovLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/records/:id" element={<RecordDetailPage />} />
          <Route path="/gis" element={<GISPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </GovLayout>
    </BrowserRouter>
  );
}
