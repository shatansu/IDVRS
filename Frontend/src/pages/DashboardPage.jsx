import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip,
  XAxis, YAxis, ResponsiveContainer, Legend
} from 'recharts';
import {
  FileText, Database, AlertTriangle, CheckCircle2,
  Copy, Clock, Loader2, ArrowRight, ShieldCheck,
  TrendingUp, Sparkles, Building2, UploadCloud
} from 'lucide-react';

/* ── Official Gov Colors ───────────────────────────────────── */
const CHART_BAR_COLOR = '#1e3a8a';
const PIE_COLORS = ['#059669', '#d97706'];

/* ── Metric Card Component ─────────────────────────────────── */
function MetricCard({ title, hindiTitle, value, subtext, icon: Icon, accentColor, badge }) {
  return (
    <div className="gov-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
            {title}
          </span>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: `${accentColor}12`,
            color: accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon size={20} />
          </div>
        </div>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '4px' }}>
          {hindiTitle}
        </p>
        <p style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          {value ?? '—'}
        </p>
      </div>

      <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{subtext}</span>
        {badge && (
          <span className={`gov-badge ${badge.type}`}>
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Custom Tooltips ───────────────────────────────────────── */
function BarTooltip({ active, payload }) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f172a', color: '#ffffff', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
      <p style={{ fontWeight: 700, color: '#38bdf8' }}>{payload[0].payload.district}</p>
      <p style={{ marginTop: '2px' }}>{t('dashboard.tooltip_total_khata')} <strong>{payload[0].value}</strong></p>
    </div>
  );
}

function PieTooltip({ active, payload }) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f172a', color: '#ffffff', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
      <p style={{ fontWeight: 700, color: payload[0].payload.fill }}>{payload[0].name}</p>
      <p style={{ marginTop: '2px' }}>{t('dashboard.tooltip_count')} <strong>{payload[0].value} {t('dashboard.tooltip_khata_unit')}</strong></p>
    </div>
  );
}

/* ── Executive Dashboard Page ──────────────────────────────── */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get('/api/dashboard/stats', { timeout: 10000 })
      .then(res => {
        setStats(res.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.detail || err.message || t('dashboard.error_load'));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
        <div className="gov-spinner" />
        <p style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>
          {t('dashboard.loading')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
        <div className="gov-alert error">
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>{t('dashboard.error_title')}</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  const pieData = (stats.records_by_review_status || []).map((d, i) => ({
    ...d,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px 48px' }}>

      {/* 1. Header & Hero Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '28px',
        background: '#ffffff',
        padding: '24px 28px',
        borderRadius: '12px',
        border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="gov-badge info">
              <ShieldCheck size={12} /> {t('dashboard.badge_dilrmp')}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {t('dashboard.node_active')}
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            {t('dashboard.title')}
          </h1>
          <p style={{ color: '#475569', fontSize: '0.9rem', marginTop: '4px' }}>
            {t('dashboard.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-gov-secondary"
            onClick={() => navigate('/records')}
          >
            <Database size={15} /> {t('dashboard.btn_view_records')} ({stats.total_khatas})
          </button>
          <button
            className="btn-gov-primary"
            onClick={() => navigate('/upload')}
          >
            <UploadCloud size={16} /> {t('dashboard.btn_digitize')}
          </button>
        </div>
      </div>

      {/* 2. Primary KPI Grid (6 Metric Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <MetricCard
          title={t('dashboard.metric_docs_title')}
          hindiTitle={t('dashboard.metric_docs_hindi')}
          value={stats.total_documents}
          subtext={t('dashboard.metric_docs_sub')}
          icon={FileText}
          accentColor="#2563eb"
          badge={{ text: 'Active Ingest', type: 'info' }}
        />

        <MetricCard
          title={t('dashboard.metric_khatas_title')}
          hindiTitle={t('dashboard.metric_khatas_hindi')}
          value={stats.total_khatas}
          subtext={t('dashboard.metric_khatas_sub')}
          icon={Database}
          accentColor="#1e3a8a"
          badge={{ text: 'MySQL Verified', type: 'verified' }}
        />

        <MetricCard
          title={t('dashboard.metric_confidence_title')}
          hindiTitle={t('dashboard.metric_confidence_hindi')}
          value={stats.average_confidence ? `${stats.average_confidence}%` : '—'}
          subtext={t('dashboard.metric_confidence_sub')}
          icon={TrendingUp}
          accentColor="#059669"
          badge={{ text: 'High Accuracy', type: 'verified' }}
        />

        <MetricCard
          title={t('dashboard.metric_pending_title')}
          hindiTitle={t('dashboard.metric_pending_hindi')}
          value={stats.pending_review_count}
          subtext={t('dashboard.metric_pending_sub')}
          icon={Clock}
          accentColor="#d97706"
          badge={{ text: 'Review Queue', type: 'pending' }}
        />

        <MetricCard
          title={t('dashboard.metric_dup_title')}
          hindiTitle={t('dashboard.metric_dup_hindi')}
          value={stats.duplicate_count}
          subtext={t('dashboard.metric_dup_sub')}
          icon={Copy}
          accentColor="#dc2626"
          badge={{ text: 'Flagged', type: 'duplicate' }}
        />

        <MetricCard
          title={t('dashboard.metric_verified_title')}
          hindiTitle={t('dashboard.metric_verified_hindi')}
          value={stats.verified_count}
          subtext={t('dashboard.metric_verified_sub')}
          icon={CheckCircle2}
          accentColor="#059669"
          badge={{ text: 'Ready for RoR', type: 'verified' }}
        />
      </div>

      {/* 3. Analytics Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '24px', alignItems: 'start', marginBottom: '28px' }}>

        {/* Left: District Breakdown Bar Chart */}
        <div className="gov-card" style={{ padding: 0 }}>
          <div className="gov-card-header">
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                {t('dashboard.chart_district_title')}
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {t('dashboard.chart_district_sub')}
              </p>
            </div>
            <span className="gov-badge info">
              {stats.records_by_district.length} {t('dashboard.chart_district_active')}
            </span>
          </div>

          <div style={{ padding: '24px 20px 16px' }}>
            {stats.records_by_district.length === 0 ? (
              <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                {t('dashboard.chart_district_empty')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.records_by_district} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <XAxis dataKey="district" tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="count" fill={CHART_BAR_COLOR} radius={[6, 6, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right: Verification Status Donut Chart */}
        <div className="gov-card" style={{ padding: 0 }}>
          <div className="gov-card-header">
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                {t('dashboard.chart_status_title')}
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {t('dashboard.chart_status_sub')}
              </p>
            </div>
            <span className="gov-badge verified">
              {t('dashboard.chart_status_badge')}
            </span>
          </div>

          <div style={{ padding: '20px' }}>
            {stats.total_khatas === 0 ? (
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                {t('dashboard.chart_status_empty')}
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="count"
                      nameKey="status"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {pieData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#f8fafc', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: d.fill }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#1e293b' }}>{d.status}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: d.fill }}>
                        {d.count} ({stats.total_khatas > 0 ? Math.round((d.count / stats.total_khatas) * 100) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      {/* 4. Quick Workflow & Guidelines Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #0c162c 100%)',
        color: '#ffffff',
        borderRadius: '12px',
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Sparkles size={18} color="#38bdf8" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8' }}>
              {t('dashboard.workflow_tag')}
            </span>
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', margin: '0 0 4px' }}>
            {t('dashboard.workflow_title')}
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#cbd5e1', maxWidth: '700px', margin: 0 }}>
            {t('dashboard.workflow_desc')}
          </p>
        </div>

        <button
          onClick={() => navigate('/upload')}
          style={{
            background: '#ffffff',
            color: '#0f172a',
            fontWeight: 700,
            fontSize: '0.9rem',
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            transition: 'transform 0.15s ease'
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <UploadCloud size={18} color="#1e3a8a" /> {t('dashboard.workflow_btn')} <ArrowRight size={16} />
        </button>
      </div>

    </div>
  );
}
