import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  UploadCloud, FileText, X, CheckCircle2,
  AlertCircle, Sparkles, Shield, ArrowRight,
  HelpCircle, RefreshCw, FileCheck
} from 'lucide-react';

const ACCEPTED_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];
const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

export default function UploadPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fileInput = useRef(null);

  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState(null);

  /* ── File validation ───────────────────────────────────────── */
  const validateFile = (f) => {
    if (!f) return t('upload.validate_no_file');
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME.includes(f.type)) {
      return t('upload.validate_type');
    }
    if (f.size > 50 * 1024 * 1024) return t('upload.validate_size');
    return null;
  };

  const pickFile = (f) => {
    const err = validateFile(f);
    if (err) {
      setError(err);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  };

  /* ── Drag & Drop ───────────────────────────────────────────── */
  const onDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); setDragging(false); }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  }, []);

  const clearFile = () => {
    setFile(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  /* ── 1-Click Sample Demo Loader ────────────────────────────── */
  const loadSamplePreset = async (filename, displayName, mimeType = 'application/pdf') => {
    try {
      setError(null);
      setCurrentStep(`${t('upload.sample_loading')} ${displayName}...`);
      setUploading(true);

      const response = await fetch(`/samples/${filename}`);
      if (!response.ok) throw new Error(t('upload.sample_fail'));

      const blob = await response.blob();
      const sampleFile = new File([blob], filename, { type: mimeType });
      setFile(sampleFile);

      await executeUpload(sampleFile);
    } catch (err) {
      setError(err.message || t('upload.sample_error'));
      setUploading(false);
    }
  };

  /* ── Upload & Pipeline Execution ───────────────────────────── */
  const executeUpload = async (targetFile) => {
    const uploadTarget = targetFile || file;
    if (!uploadTarget) return;

    setUploading(true);
    setError(null);

    try {
      setCurrentStep(t('upload.step_upload'));
      const formData = new FormData();
      formData.append('file', uploadTarget);

      setTimeout(() => setCurrentStep(t('upload.step_preprocess')), 700);
      setTimeout(() => setCurrentStep(t('upload.step_ocr')), 1600);
      setTimeout(() => setCurrentStep(t('upload.step_validate')), 2400);

      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      });

      const data = res.data;

      navigate('/review', {
        state: {
          documentId: data.document_id,
          documentType: data.document_type,
          filename: data.original_filename,
          sourceMode: data.source_mode,
          classification: data.classification,
          engineUsed: data.engine_used,
          evidence: data.evidence,
          pageCount: data.page_count,
          structuredData: data.structured_data,
          fileUrl: URL.createObjectURL(uploadTarget),
          fileType: uploadTarget.type,
        }
      });
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || t('upload.extract_fail');
      setError(detail);
      setUploading(false);
      setCurrentStep('');
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '36px 20px 60px' }}>

      {/* 1. Loading Overlay */}
      {uploading && (
        <div className="gov-loading-overlay">
          <div className="gov-loading-box">
            <div className="gov-spinner" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              {t('upload.loading_overlay_title')}
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#475569', margin: 0, fontWeight: 500 }}>
              {currentStep || t('upload.loading_overlay_wait')}
            </p>
            <div style={{
              width: '100%',
              background: '#f1f5f9',
              borderRadius: '999px',
              height: '6px',
              overflow: 'hidden',
              marginTop: '8px'
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #1e3a8a, #059669)',
                borderRadius: '999px',
                animation: 'pulseDot 1.5s infinite'
              }} />
            </div>
          </div>
        </div>
      )}

      {/* 2. Step Flow Guide */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '28px',
        background: '#ffffff',
        padding: '16px 20px',
        borderRadius: '12px',
        border: '1px solid var(--border-card)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#1e3a8a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
            1
          </div>
          <div>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('upload.step1_label')}</p>
            <p style={{ fontSize: '0.725rem', color: '#64748b', margin: 0 }}>{t('upload.step1_sub')}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#059669', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
            2
          </div>
          <div>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('upload.step2_label')}</p>
            <p style={{ fontSize: '0.725rem', color: '#64748b', margin: 0 }}>{t('upload.step2_sub')}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#64748b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
            3
          </div>
          <div>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('upload.step3_label')}</p>
            <p style={{ fontSize: '0.725rem', color: '#64748b', margin: 0 }}>{t('upload.step3_sub')}</p>
          </div>
        </div>
      </div>

      {/* 3. Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
          {t('upload.page_title')}
        </h1>
        <p style={{ color: '#475569', fontSize: '0.9rem', margin: 0 }}>
          {t('upload.page_subtitle')}
        </p>
      </div>

      {/* 4. Quick Demo Preset Buttons */}
      <div style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} color="#1d4ed8" />
          <div>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', margin: 0 }}>
              {t('upload.demo_tag')}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#3b82f6', margin: 0 }}>
              {t('upload.demo_sub')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => loadSamplePreset('CertifiedCopy_Bhu-AdhikarPustika_25030879728.pdf', t('upload.demo_form4'), 'application/pdf')}
            disabled={uploading}
            style={{ fontSize: '0.8rem', padding: '7px 14px', background: '#ffffff', borderColor: '#93c5fd' }}
          >
            <FileCheck size={14} color="#1d4ed8" /> {t('upload.demo_form4')}
          </button>

          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => loadSamplePreset('CertifiedCopy_Khatoni(B1)Copy_25030868731.pdf', t('upload.demo_form7'), 'application/pdf')}
            disabled={uploading}
            style={{ fontSize: '0.8rem', padding: '7px 14px', background: '#ffffff', borderColor: '#93c5fd' }}
          >
            <FileCheck size={14} color="#1d4ed8" /> {t('upload.demo_form7')}
          </button>

          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => loadSamplePreset('Handwritten_Register_Simariya_Panna.jpeg', t('upload.demo_hwr'), 'image/jpeg')}
            disabled={uploading}
            style={{ fontSize: '0.8rem', padding: '7px 14px', background: '#ffffff', borderColor: '#c4b5fd' }}
          >
            <Sparkles size={14} color="#7c3aed" /> {t('upload.demo_hwr')}
          </button>
        </div>
      </div>

      {/* 5. Error Alert */}
      {error && (
        <div className="gov-alert error">
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>{t('upload.error_prefix')}</strong> {error}
          </div>
        </div>
      )}

      {/* 6. Drag and Drop Zone */}
      <div className="gov-card" style={{ padding: '32px', marginBottom: '24px' }}>
        <div
          className={`gov-dropzone ${dragging ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !file && fileInput.current?.click()}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={e => {
              const picked = e.target.files?.[0];
              if (picked) pickFile(picked);
            }}
          />

          {file ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '12px',
                background: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FileText size={28} />
              </div>
              <div>
                <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem', margin: '0 0 2px' }}>
                  {file.name}
                </p>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                  {(file.size / 1024).toFixed(1)} KB • {file.type || t('upload.file_unit')}
                </p>
              </div>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                style={{ marginTop: '6px', fontSize: '0.78rem', padding: '5px 12px' }}
              >
                <X size={13} /> {t('upload.file_remove')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: '#eff6ff',
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <UploadCloud size={32} />
              </div>
              <div>
                <p style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                  {t('upload.dropzone_title')}
                </p>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  {t('upload.dropzone_sub')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {ACCEPTED_TYPES.map(t => (
                  <span key={t} style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontSize: '0.75rem',
                    color: '#475569',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {t.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 7. Supported Formats Information Box */}
      <div className="gov-card" style={{ padding: '20px 24px', marginBottom: '28px' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
          {t('upload.formats_title')}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span className="gov-badge info" style={{ marginBottom: '6px' }}>{t('upload.form4_badge')}</span>
            <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', margin: '4px 0 2px' }}>
              {t('upload.form4_name')}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
              {t('upload.form4_desc')}
            </p>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span className="gov-badge verified" style={{ marginBottom: '6px' }}>{t('upload.form7_badge')}</span>
            <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', margin: '4px 0 2px' }}>
              {t('upload.form7_name')}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
              {t('upload.form7_desc')}
            </p>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span className="gov-badge warning" style={{ marginBottom: '6px' }}>{t('upload.hwr_badge')}</span>
            <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', margin: '4px 0 2px' }}>
              {t('upload.hwr_name')}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
              {t('upload.hwr_desc')}
            </p>
          </div>
        </div>
      </div>

      {/* 8. Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
        {file && (
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={clearFile}
            disabled={uploading}
          >
            {t('upload.btn_cancel')}
          </button>
        )}

        <button
          type="button"
          className="btn-gov-primary"
          onClick={() => executeUpload(file)}
          disabled={!file || uploading}
          style={{ padding: '11px 28px', fontSize: '0.95rem' }}
        >
          <UploadCloud size={18} /> {t('upload.btn_process')} <ArrowRight size={16} />
        </button>
      </div>

    </div>
  );
}
