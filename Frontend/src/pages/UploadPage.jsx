import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  UploadCloud, FileText, X, CheckCircle2,
  AlertCircle, Sparkles, Shield, ArrowRight,
  HelpCircle, RefreshCw, FileCheck, Layers,
  Plus, Trash2, Play, Check, Eye
} from 'lucide-react';
import ConfidenceBadge from '../components/ConfidenceBadge';

const ACCEPTED_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];
const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

export default function UploadPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fileInput = useRef(null);
  const addMoreInput = useRef(null);

  /* ── Queue State: Array of file items ── */
  const [fileQueue, setFileQueue] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState(null);

  /* ── File validation ───────────────────────────────────────── */
  const validateSingleFile = (f) => {
    if (!f) return t('upload.validate_no_file');
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME.includes(f.type)) {
      return t('upload.validate_type');
    }
    if (f.size > 50 * 1024 * 1024) return t('upload.validate_size');
    return null;
  };

  /* ── Adding Files to Queue ─────────────────────────────────── */
  const addFilesToQueue = (newFiles) => {
    setError(null);
    const validItems = [];
    let firstError = null;

    for (const f of newFiles) {
      const err = validateSingleFile(f);
      if (err) {
        if (!firstError) firstError = `${f.name}: ${err}`;
        continue;
      }
      // Avoid duplicate file names in queue
      const isDuplicate = fileQueue.some(item => item.name === f.name && item.size === f.size);
      if (!isDuplicate) {
        validItems.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          file: f,
          name: f.name,
          size: f.size,
          type: f.type || 'application/octet-stream',
          status: 'pending', // 'pending' | 'processing' | 'completed' | 'error'
          progressStep: '',
          data: null,
          fileUrl: URL.createObjectURL(f),
          error: null
        });
      }
    }

    if (firstError && validItems.length === 0) {
      setError(firstError);
      return;
    }

    setFileQueue(prev => [...prev, ...validItems]);
  };

  /* ── Drag & Drop Handlers ──────────────────────────────────── */
  const onDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); setDragging(false); }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) addFilesToQueue(dropped);
  }, [fileQueue]);

  const removeQueueItem = (id) => {
    setFileQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearQueue = () => {
    setFileQueue([]);
    setError(null);
    setCurrentProcessingIndex(-1);
    if (fileInput.current) fileInput.current.value = '';
    if (addMoreInput.current) addMoreInput.current.value = '';
  };

  /* ── 1-Click Sample Demo Preset Loader ──────────────────────── */
  const loadSingleSample = async (filename, displayName, mimeType = 'application/pdf') => {
    try {
      setError(null);
      const response = await fetch(`/samples/${filename}`);
      if (!response.ok) throw new Error(t('upload.sample_fail'));
      const blob = await response.blob();
      const sampleFile = new File([blob], filename, { type: mimeType });
      addFilesToQueue([sampleFile]);
    } catch (err) {
      setError(err.message || t('upload.sample_error'));
    }
  };

  /* ── 1-Click Batch Demo Preset Loader (All 3 Evaluator Files) ── */
  const loadAllSamplesBatch = async () => {
    try {
      setError(null);
      const presets = [
        { filename: 'CertifiedCopy_Bhu-AdhikarPustika_25030879728.pdf', mime: 'application/pdf' },
        { filename: 'CertifiedCopy_Khatoni(B1)Copy_25030868731.pdf', mime: 'application/pdf' },
        { filename: 'Handwritten_Register_Simariya_Panna.jpeg', mime: 'image/jpeg' },
        { filename: 'land_record_english.pdf', mime: 'application/pdf' },
      ];

      const filesLoaded = [];
      for (const p of presets) {
        const res = await fetch(`/samples/${p.filename}`);
        if (res.ok) {
          const blob = await res.blob();
          filesLoaded.push(new File([blob], p.filename, { type: p.mime }));
        }
      }
      if (filesLoaded.length > 0) {
        addFilesToQueue(filesLoaded);
      }
    } catch (err) {
      setError(err.message || t('upload.sample_error'));
    }
  };

  /* ── Process Single File Immediately (Single Mode) ─────────── */
  const processSingleFileNow = async (item) => {
    setBatchProcessing(true);
    setCurrentProcessingIndex(0);
    setError(null);

    try {
      setCurrentStep(t('upload.step_upload'));
      const formData = new FormData();
      formData.append('file', item.file);

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
          fileUrl: item.fileUrl,
          fileType: item.type,
        }
      });
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || t('upload.extract_fail');
      setError(detail);
      setBatchProcessing(false);
      setCurrentProcessingIndex(-1);
    }
  };

  /* ── Start Batch Processing (Multi Mode) ───────────────────── */
  const startBatchProcessing = async () => {
    setBatchProcessing(true);
    setError(null);

    const queueCopy = [...fileQueue];

    for (let i = 0; i < queueCopy.length; i++) {
      const item = queueCopy[i];
      if (item.status === 'completed') continue; // Skip already completed

      setCurrentProcessingIndex(i);
      setCurrentStep(`${t('upload.step_upload')} (${i + 1}/${queueCopy.length})`);

      // Update state to processing
      setFileQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'processing', progressStep: t('upload.step_upload') } : q));

      try {
        const formData = new FormData();
        formData.append('file', item.file);

        setTimeout(() => {
          setFileQueue(prev => prev.map((q, idx) => idx === i ? { ...q, progressStep: t('upload.step_ocr') } : q));
        }, 800);

        const res = await axios.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        });

        const data = res.data;
        // Mark as completed
        setFileQueue(prev => prev.map((q, idx) => idx === i ? {
          ...q,
          status: 'completed',
          progressStep: 'Completed',
          data: data,
        } : q));
      } catch (err) {
        const detail = err.response?.data?.detail || err.message || 'Processing failed';
        setFileQueue(prev => prev.map((q, idx) => idx === i ? {
          ...q,
          status: 'error',
          error: detail
        } : q));
      }
    }

    setBatchProcessing(false);
    setCurrentProcessingIndex(-1);
    setCurrentStep('');
  };

  /* ── Navigate to Review for a Specific Completed Item ──────── */
  const reviewSpecificItem = (item) => {
    if (!item.data) return;
    const completedItems = fileQueue.filter(q => q.status === 'completed' && q.id !== item.id);
    const batchQueue = completedItems.map(q => ({
      documentId: q.data.document_id,
      documentType: q.data.document_type,
      filename: q.data.original_filename,
      sourceMode: q.data.source_mode,
      classification: q.data.classification,
      engineUsed: q.data.engine_used,
      evidence: q.data.evidence,
      pageCount: q.data.page_count,
      structuredData: q.data.structured_data,
      fileUrl: q.fileUrl,
      fileType: q.type,
    }));

    navigate('/review', {
      state: {
        documentId: item.data.document_id,
        documentType: item.data.document_type,
        filename: item.data.original_filename,
        sourceMode: item.data.source_mode,
        classification: item.data.classification,
        engineUsed: item.data.engine_used,
        evidence: item.data.evidence,
        pageCount: item.data.page_count,
        structuredData: item.data.structured_data,
        fileUrl: item.fileUrl,
        fileType: item.type,
        batchQueue: batchQueue,
        batchTotal: fileQueue.filter(q => q.status === 'completed').length,
      }
    });
  };

  /* ── Start Sequential Review for Entire Batch ──────────────── */
  const startSequentialReview = () => {
    const completedItems = fileQueue.filter(q => q.status === 'completed');
    if (completedItems.length === 0) return;

    const first = completedItems[0];
    const rest = completedItems.slice(1).map(q => ({
      documentId: q.data.document_id,
      documentType: q.data.document_type,
      filename: q.data.original_filename,
      sourceMode: q.data.source_mode,
      classification: q.data.classification,
      engineUsed: q.data.engine_used,
      evidence: q.data.evidence,
      pageCount: q.data.page_count,
      structuredData: q.data.structured_data,
      fileUrl: q.fileUrl,
      fileType: q.type,
    }));

    navigate('/review', {
      state: {
        documentId: first.data.document_id,
        documentType: first.data.document_type,
        filename: first.data.original_filename,
        sourceMode: first.data.source_mode,
        classification: first.data.classification,
        engineUsed: first.data.engine_used,
        evidence: first.data.evidence,
        pageCount: first.data.page_count,
        structuredData: first.data.structured_data,
        fileUrl: first.fileUrl,
        fileType: first.type,
        batchQueue: rest,
        batchTotal: completedItems.length,
      }
    });
  };

  /* Computed counts */
  const completedCount = fileQueue.filter(f => f.status === 'completed').length;
  const pendingCount = fileQueue.filter(f => f.status === 'pending').length;
  const errorCount = fileQueue.filter(f => f.status === 'error').length;
  const allCompleted = fileQueue.length > 0 && completedCount === fileQueue.length;

  return (
    <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 20px 60px' }}>

      {/* 1. Step Flow Guide */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '24px',
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

      {/* 2. Page Header */}
      <div style={{ marginBottom: '22px' }}>
        <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
          {t('upload.page_title')}
        </h1>
        <p style={{ color: '#475569', fontSize: '0.9rem', margin: 0 }}>
          {t('upload.page_subtitle')}
        </p>
      </div>

      {/* 3. Quick Demo Presets (Including 1-Click Batch Demo) */}
      <div style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
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
          <Sparkles size={22} color="#1d4ed8" />
          <div>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', margin: 0 }}>
              {t('upload.demo_tag')}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#3b82f6', margin: 0 }}>
              {t('upload.demo_sub')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => loadSingleSample('CertifiedCopy_Bhu-AdhikarPustika_25030879728.pdf', t('upload.demo_form4'), 'application/pdf')}
            disabled={batchProcessing}
            style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#ffffff', borderColor: '#93c5fd' }}
          >
            <FileCheck size={14} color="#1d4ed8" /> {t('upload.demo_form4')}
          </button>

          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => loadSingleSample('CertifiedCopy_Khatoni(B1)Copy_25030868731.pdf', t('upload.demo_form7'), 'application/pdf')}
            disabled={batchProcessing}
            style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#ffffff', borderColor: '#93c5fd' }}
          >
            <FileCheck size={14} color="#1d4ed8" /> {t('upload.demo_form7')}
          </button>

          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => loadSingleSample('Handwritten_Register_Simariya_Panna.jpeg', t('upload.demo_hwr'), 'image/jpeg')}
            disabled={batchProcessing}
            style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#ffffff', borderColor: '#c4b5fd' }}
          >
            <Sparkles size={14} color="#7c3aed" /> {t('upload.demo_hwr')}
          </button>

          <button
            type="button"
            className="btn-gov-secondary"
            onClick={() => loadSingleSample('land_record_english.pdf', t('upload.demo_english', '🌐 English Record (PDF)'), 'application/pdf')}
            disabled={batchProcessing}
            style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#ffffff', borderColor: '#0284c7' }}
          >
            <FileText size={14} color="#0284c7" /> {t('upload.demo_english', '🌐 English Record (PDF)')}
          </button>

          <button
            type="button"
            className="btn-gov-primary"
            onClick={loadAllSamplesBatch}
            disabled={batchProcessing}
            style={{
              fontSize: '0.78rem',
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #1e3a8a, #047857)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700
            }}
          >
            <Layers size={14} /> {t('upload.demo_batch_all')}
          </button>
        </div>
      </div>

      {/* 4. Error Alert */}
      {error && (
        <div className="gov-alert error" style={{ marginBottom: '20px' }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>{t('upload.error_prefix')}</strong> {error}
          </div>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files) addFilesToQueue(Array.from(e.target.files));
        }}
      />
      <input
        ref={addMoreInput}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files) addFilesToQueue(Array.from(e.target.files));
        }}
      />

      {/* 5. Main Work Area: Dropzone OR Batch Queue */}
      {fileQueue.length === 0 ? (
        /* Empty State: Full Dropzone */
        <div className="gov-card" style={{ padding: '36px', marginBottom: '24px' }}>
          <div
            className={`gov-dropzone ${dragging ? 'drag-over' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            style={{ cursor: 'pointer', padding: '48px 24px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '18px',
                background: '#eff6ff',
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(29, 78, 216, 0.12)'
              }}>
                <UploadCloud size={36} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                  {t('upload.dropzone_title')}
                </p>
                <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
                  {t('upload.dropzone_sub')}
                </p>
                <p style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600, marginTop: '4px' }}>
                  💡 Tip: Select multiple files or drag entire folders for batch digitization
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {ACCEPTED_TYPES.map(ext => (
                  <span key={ext} style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '3px 9px',
                    fontSize: '0.75rem',
                    color: '#475569',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {ext.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Populated State: Batch Processing Queue */
        <div className="gov-card" style={{ padding: '24px', marginBottom: '24px' }}>
          {/* Queue Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            borderBottom: '1px solid var(--border-card)',
            paddingBottom: '16px',
            marginBottom: '18px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Layers size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {t('upload.batch_queue_title')}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                  {fileQueue.length} {t('upload.batch_docs_selected')} • {completedCount} {t('upload.status_completed')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={() => addMoreInput.current?.click()}
                disabled={batchProcessing}
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                <Plus size={14} /> {t('upload.btn_add_more')}
              </button>
              <button
                type="button"
                className="btn-gov-secondary"
                onClick={clearQueue}
                disabled={batchProcessing}
                style={{ fontSize: '0.8rem', padding: '6px 14px', color: '#dc2626' }}
              >
                <Trash2 size={14} /> {t('upload.btn_clear_all')}
              </button>
            </div>
          </div>

          {/* Batch Progress Banner (when running) */}
          {batchProcessing && (
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a' }}>
                  ⚙️ Digitizing document {currentProcessingIndex + 1} of {fileQueue.length}...
                </span>
                <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600 }}>
                  {Math.round(((currentProcessingIndex) / fileQueue.length) * 100)}%
                </span>
              </div>
              <div style={{ width: '100%', background: '#dbeafe', borderRadius: '999px', height: '7px', overflow: 'hidden' }}>
                <div style={{
                  width: `${((currentProcessingIndex + 1) / fileQueue.length) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #1e3a8a, #059669)',
                  borderRadius: '999px',
                  transition: 'width 0.4s ease'
                }} />
              </div>
            </div>
          )}

          {/* All Completed Banner */}
          {allCompleted && (
            <div style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={22} color="#059669" />
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#065f46', margin: 0 }}>
                    {t('upload.batch_completed_summary', { success: completedCount, total: fileQueue.length })}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#047857', margin: 0 }}>
                    All fields extracted, validated, and ready for operator review
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn-gov-primary"
                onClick={startSequentialReview}
                style={{ padding: '8px 20px', fontSize: '0.88rem' }}
              >
                {t('upload.btn_start_review_queue')}
              </button>
            </div>
          )}

          {/* Queue Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {fileQueue.map((item, idx) => {
              const isPdf = item.name.toLowerCase().endsWith('.pdf');
              const sd = item.data?.structured_data;
              const khataMeta = sd?.khata || {};
              const meta = sd?.extraction_meta || {};
              const docTypeLabel = sd?.khata?.document_type?.value || item.data?.document_type || 'Land Record';

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    border: `1px solid ${
                      item.status === 'processing'
                        ? '#3b82f6'
                        : item.status === 'completed'
                        ? '#a7f3d0'
                        : item.status === 'error'
                        ? '#fca5a5'
                        : '#e2e8f0'
                    }`,
                    background: item.status === 'processing' ? '#f0f7ff' : item.status === 'completed' ? '#f0fdf4' : '#ffffff',
                    transition: 'all 0.2s ease',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  {/* Left: File Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: item.status === 'completed' ? '#d1fae5' : isPdf ? '#fee2e2' : '#e0e7ff',
                      color: item.status === 'completed' ? '#059669' : isPdf ? '#dc2626' : '#4338ca',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <FileText size={22} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', margin: '0 0 2px', wordBreak: 'break-all' }}>
                        {item.name}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                        {(item.size / 1024).toFixed(1)} KB • {isPdf ? 'PDF' : 'Image'}
                      </p>
                    </div>
                  </div>

                  {/* Center: Extracted Data / Status */}
                  <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {item.status === 'pending' && (
                      <span className="gov-badge neutral">
                        ⏳ {t('upload.status_pending')}
                      </span>
                    )}

                    {item.status === 'processing' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="gov-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1d4ed8' }}>
                          {item.progressStep || t('upload.status_processing')}
                        </span>
                      </div>
                    )}

                    {item.status === 'completed' && sd && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="gov-badge verified" style={{ fontSize: '0.75rem' }}>
                          ✓ {docTypeLabel}
                        </span>

                        {khataMeta.khata_number?.value && (
                          <span style={{ fontSize: '0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', padding: '2px 7px', borderRadius: '5px', color: '#334155' }}>
                            खाता: <strong>#{khataMeta.khata_number.value}</strong>
                          </span>
                        )}

                        {khataMeta.village?.value && (
                          <span style={{ fontSize: '0.75rem', background: '#ffffff', border: '1px solid #cbd5e1', padding: '2px 7px', borderRadius: '5px', color: '#334155' }}>
                            ग्राम: <strong>{khataMeta.village.value}</strong>
                          </span>
                        )}

                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {meta.owners_found || 0} Owners • {meta.parcels_found || 0} Parcels
                        </span>

                        <ConfidenceBadge score={meta.average_confidence} />
                      </div>
                    )}

                    {item.status === 'error' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '0.8rem' }}>
                        <AlertCircle size={15} />
                        <span>{item.error || t('upload.status_error')}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.status === 'completed' && (
                      <button
                        type="button"
                        className="btn-gov-secondary"
                        onClick={() => reviewSpecificItem(item)}
                        style={{ fontSize: '0.78rem', padding: '5px 12px', background: '#ffffff', borderColor: '#a7f3d0', color: '#047857' }}
                      >
                        <Eye size={13} /> {t('upload.btn_review_item')}
                      </button>
                    )}

                    {!batchProcessing && (
                      <button
                        type="button"
                        onClick={() => removeQueueItem(item.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#94a3b8',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Remove from queue"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Queue Action Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-card)',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <button
              type="button"
              className="btn-gov-secondary"
              onClick={() => addMoreInput.current?.click()}
              disabled={batchProcessing}
              style={{ fontSize: '0.85rem' }}
            >
              <Plus size={15} /> {t('upload.btn_add_more')}
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              {/* If only 1 file and still pending, offer single direct process */}
              {fileQueue.length === 1 && fileQueue[0].status === 'pending' && (
                <button
                  type="button"
                  className="btn-gov-primary"
                  onClick={() => processSingleFileNow(fileQueue[0])}
                  disabled={batchProcessing}
                  style={{ padding: '10px 24px', fontSize: '0.9rem' }}
                >
                  <UploadCloud size={17} /> {t('upload.btn_process')} <ArrowRight size={15} />
                </button>
              )}

              {/* If multiple or not single */}
              {(fileQueue.length > 1 || pendingCount > 0) && (
                <button
                  type="button"
                  className="btn-gov-primary"
                  onClick={startBatchProcessing}
                  disabled={batchProcessing || pendingCount === 0}
                  style={{
                    padding: '10px 26px',
                    fontSize: '0.9rem',
                    background: pendingCount > 0 ? 'linear-gradient(135deg, #1e3a8a, #047857)' : undefined
                  }}
                >
                  <Play size={15} /> {t('upload.btn_batch_process')} ({pendingCount || fileQueue.length})
                </button>
              )}

              {allCompleted && (
                <button
                  type="button"
                  className="btn-gov-primary"
                  onClick={startSequentialReview}
                  style={{
                    padding: '10px 26px',
                    fontSize: '0.9rem',
                    background: '#047857'
                  }}
                >
                  {t('upload.btn_start_review_queue')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Supported Formats Information Box */}
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

    </div>
  );
}
