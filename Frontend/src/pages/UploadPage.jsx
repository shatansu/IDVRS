import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UploadCloud, FileText, X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const ACCEPTED_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];
const ACCEPTED_MIME  = ['application/pdf', 'image/jpeg', 'image/png'];

export default function UploadPage() {
  const navigate  = useNavigate();
  const fileInput = useRef(null);

  const [file,       setFile]       = useState(null);
  const [dragging,   setDragging]   = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [error,      setError]      = useState(null);

  /* ── File validation ─────────────────────────────────────── */
  const validateFile = (f) => {
    if (!f) return 'No file selected.';
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME.includes(f.type)) {
      return `Unsupported file type. Please upload a PDF, JPG, or PNG.`;
    }
    if (f.size > 50 * 1024 * 1024) return 'File size exceeds 50 MB limit.';
    return null;
  };

  const pickFile = (f) => {
    const err = validateFile(f);
    if (err) { setError(err); setFile(null); return; }
    setError(null);
    setFile(f);
  };

  /* ── Drag & Drop handlers ────────────────────────────────── */
  const onDragOver  = useCallback((e) => { e.preventDefault(); setDragging(true);  }, []);
  const onDragLeave = useCallback((e) => { e.preventDefault(); setDragging(false); }, []);
  const onDrop      = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  }, []);

  const onFileChange = (e) => {
    const picked = e.target.files?.[0];
    if (picked) pickFile(picked);
  };

  const clearFile = () => {
    setFile(null); setError(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  /* ── Upload ──────────────────────────────────────────────── */
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setStatusMsg('Uploading document…');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setStatusMsg('Extracting text (Phase 2)…');
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
        onUploadProgress: (p) => {
          if (p.total) setStatusMsg(`Uploading… ${Math.round((p.loaded / p.total) * 100)}%`);
        },
      });

      setStatusMsg('Running field extraction (Phase 3)…');
      await new Promise(r => setTimeout(r, 300)); // allow UI to update

      const data = res.data;

      // Navigate to review page, passing full result via router state
      navigate('/review', {
        state: {
          documentId:    data.document_id,
          documentType:  data.document_type,
          filename:      data.original_filename,
          sourceMode:    data.source_mode,
          pageCount:     data.page_count,
          structuredData: data.structured_data,
          // Pass the file object URL so review page can show a preview
          fileUrl: URL.createObjectURL(file),
          fileType: file.type,
        }
      });
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Upload failed.';
      setError(detail);
      setUploading(false);
      setStatusMsg('');
    }
  };

  /* ── Render ──────────────────────────────────────────────── */
  const dropCls = [
    'drop-zone',
    dragging ? 'drag-over' : '',
    file      ? 'has-file' : '',
  ].join(' ');

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px', maxWidth: '760px', margin: '0 auto' }}>

      {/* Loading overlay */}
      {uploading && (
        <div className="loading-overlay">
          <div className="processing-ring" />
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#c7d2fe', fontWeight: 600, fontSize: '1.05rem' }}>Processing Document</p>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '6px' }}>{statusMsg}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{
            background: 'rgba(99,102,241,0.15)', color: '#818cf8',
            fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px',
            borderRadius: '999px', border: '1px solid rgba(99,102,241,0.3)', letterSpacing: '0.05em'
          }}>SIH 26018 • DO&LR</span>
          <span style={{
            background: 'rgba(16,185,129,0.15)', color: '#34d399',
            fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px',
            borderRadius: '999px', border: '1px solid rgba(16,185,129,0.3)', letterSpacing: '0.05em'
          }}>PHASE 5</span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f3f4f6', letterSpacing: '-0.02em' }}>
          Upload Land Record
        </h1>
        <p style={{ color: '#9ca3af', marginTop: '6px', fontSize: '0.95rem' }}>
          Upload a certified copy (PDF / JPG / PNG). The system will extract and validate all fields automatically.
        </p>
      </header>

      {/* Drop zone */}
      <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
        <div
          className={dropCls}
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
            onChange={onFileChange}
          />

          {file ? (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '14px',
                background: 'rgba(16,185,129,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FileText size={26} color="#34d399" />
              </div>
              <div>
                <p style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '1rem' }}>{file.name}</p>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '4px' }}>
                  {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown type'}
                </p>
              </div>
              <button
                className="btn-ghost"
                onClick={(e) => { e.stopPropagation(); clearFile(); }}
                style={{ marginTop: '4px' }}
              >
                <X size={15} /> Remove
              </button>
            </>
          ) : (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: '18px',
                background: 'rgba(99,102,241,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <UploadCloud size={30} color="#818cf8" />
              </div>
              <div>
                <p style={{ fontWeight: 600, color: '#e5e7eb', fontSize: '1.05rem' }}>
                  Drag & drop your document here
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '4px' }}>
                  or click to browse — PDF, JPG, PNG up to 50 MB
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {ACCEPTED_TYPES.map(t => (
                  <span key={t} style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px', padding: '3px 10px', fontSize: '0.8rem', color: '#9ca3af'
                  }}>{t.toUpperCase()}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="validation-banner error" style={{ marginBottom: '16px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Supported documents info */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <p className="section-label">Supported Document Types</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {[
            { name: 'Bhu-Adhikar Pustika', form: 'Form 4 (प्रारूप-4)', color: '#818cf8' },
            { name: 'Khatoni B-1 (Jamabandi)', form: 'Form 7 (प्रारूप-7)', color: '#34d399' },
          ].map(d => (
            <div key={d.name} style={{
              padding: '12px 14px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)'
            }}>
              <p style={{ fontWeight: 600, color: d.color, fontSize: '0.9rem' }}>{d.name}</p>
              <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '3px' }}>{d.form}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Process button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        {file && (
          <button className="btn-ghost" onClick={clearFile}>
            <X size={16} /> Clear
          </button>
        )}
        <button
          className="btn-primary"
          onClick={handleUpload}
          disabled={!file || uploading}
          style={{ minWidth: '200px', justifyContent: 'center', padding: '12px 28px', fontSize: '1rem' }}
        >
          {uploading
            ? <><Loader2 size={18} className="animate-spin" /> Processing…</>
            : <><UploadCloud size={18} /> Process Document</>
          }
        </button>
      </div>

    </div>
  );
}
