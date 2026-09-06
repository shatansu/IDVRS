import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip,
  XAxis, YAxis, ResponsiveContainer, Legend
} from 'recharts';
import {
  FileText, Database, AlertTriangle, CheckCircle2,
  Copy, Clock, Loader2, TrendingUp, ArrowRight
} from 'lucide-react';

/* ── Color palette ──────────────────────────────────────── */
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#8b5cf6', '#ec4899'];
const PIE_COLORS   = ['#10b981', '#f59e0b'];

/* ── Stat card ──────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, accent, sub }) {
  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            {label}
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#f3f4f6', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {value ?? '—'}
          </p>
          {sub && <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 6 }}>{sub}</p>}
        </div>
        <div style={{ padding: 10, borderRadius: 12, background: `${accent}18`, color: accent }}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

/* ── Custom tooltip for bar chart ──────────────────────── */
function CustomBarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', fontSize: '0.85rem' }}>
      <p style={{ color: '#818cf8', fontWeight: 700 }}>{payload[0].payload.district}</p>
      <p style={{ color: '#e5e7eb', marginTop: 2 }}>{payload[0].value} record{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  );
}

/* ── Custom tooltip for pie chart ──────────────────────── */
function CustomPieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', fontSize: '0.85rem' }}>
      <p style={{ color: payload[0].payload.fill || '#e5e7eb', fontWeight: 700 }}>{payload[0].name}</p>
      <p style={{ color: '#e5e7eb', marginTop: 2 }}>{payload[0].value} record{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  );
}

/* ── Dashboard ──────────────────────────────────────────── */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    axios.get('/api/dashboard/stats', { timeout: 10000 })
      .then(res => { setStats(res.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.detail || err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <Loader2 size={36} className="animate-spin" style={{ color: '#6366f1' }} />
      <p style={{ color: '#6b7280' }}>Loading dashboard…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <div className="validation-banner error" style={{ maxWidth: 600, margin: '0 auto' }}>
        <AlertTriangle size={18} /> {error}
      </div>
    </div>
  );

  const pieData = (stats.records_by_review_status || []).map((d, i) => ({
    ...d,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', padding: '28px 20px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f3f4f6', letterSpacing: '-0.02em' }}>Dashboard</h1>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 3 }}>
              System overview · all records across all districts
            </p>
          </div>
          <button className="btn-ghost" onClick={() => navigate('/records')}>
            View All Records <ArrowRight size={14} />
          </button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 28 }}>
          <StatCard
            icon={FileText}
            label="Documents Processed"
            value={stats.total_documents}
            accent="#3b82f6"
            sub="All uploads including OCR"
          />
          <StatCard
            icon={Database}
            label="Saved Khata Records"
            value={stats.total_khatas}
            accent="#6366f1"
            sub="Persisted to database"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg. Confidence"
            value={stats.average_confidence ? `${stats.average_confidence}%` : '—'}
            accent="#10b981"
            sub="Based on khata_number field"
          />
          <StatCard
            icon={Clock}
            label="Pending Review"
            value={stats.pending_review_count}
            accent="#f59e0b"
            sub="Awaiting manual verification"
          />
          <StatCard
            icon={Copy}
            label="Duplicate Flags"
            value={stats.duplicate_count}
            accent="#f43f5e"
            sub="Possible duplicate records"
          />
          <StatCard
            icon={CheckCircle2}
            label="Verified Records"
            value={stats.verified_count}
            accent="#10b981"
            sub="Manually verified"
          />
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>

          {/* Bar chart — records by district */}
          <div className="glass-card" style={{ padding: 24 }}>
            <p style={{ fontWeight: 700, color: '#e5e7eb', marginBottom: 4, fontSize: '0.95rem' }}>
              Records by District
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: 20 }}>Number of khata records grouped by district</p>
            {stats.records_by_district.length === 0 ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>
                No district data available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={stats.records_by_district}
                  margin={{ top: 4, right: 4, left: -16, bottom: 4 }}
                >
                  <XAxis
                    dataKey="district"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {stats.records_by_district.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pie chart — review status breakdown */}
          <div className="glass-card" style={{ padding: 24 }}>
            <p style={{ fontWeight: 700, color: '#e5e7eb', marginBottom: 4, fontSize: '0.95rem' }}>
              Review Status
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: 20 }}>Verified vs. Pending records</p>
            {stats.total_khatas === 0 ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>
                No records yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="status"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Legend
                    formatter={(value) => <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Legend summary */}
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pieData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: d.fill }} />
                    <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>{d.status}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: d.fill }}>
                    {d.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Recent activity strip */}
        <div className="glass-card" style={{ padding: 20, marginTop: 20 }}>
          <p style={{ fontWeight: 700, color: '#e5e7eb', marginBottom: 14, fontSize: '0.9rem' }}>Quick Summary</p>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Documents', val: stats.total_documents, color: '#3b82f6' },
              { label: 'Khata Records',   val: stats.total_khatas,   color: '#6366f1' },
              { label: 'Verified',         val: stats.verified_count, color: '#10b981' },
              { label: 'Pending',          val: stats.pending_review_count, color: '#f59e0b' },
              { label: 'Duplicates',       val: stats.duplicate_count, color: '#f43f5e' },
              { label: 'Avg Confidence',   val: stats.average_confidence ? `${stats.average_confidence}%` : '—', color: '#10b981' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280' }}>{label}</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
