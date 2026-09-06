import React from 'react';

/**
 * ConfidenceBadge — Displays an official color-coded confidence pill.
 * score >= 0.80 → Emerald Green (High confidence)
 * score >= 0.60 → Amber (Moderate / Verify)
 * score <  0.60 → Rose / Red (Low / Attention required)
 */
export default function ConfidenceBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="conf-pill neutral">—</span>;
  }

  let tierClass = 'neutral';
  const pct = Math.round(score * 100);

  if (score >= 0.80) {
    tierClass = 'high';
  } else if (score >= 0.60) {
    tierClass = 'med';
  } else if (score > 0) {
    tierClass = 'low';
  }

  return (
    <span className={`conf-pill ${tierClass}`} title={`Extraction Confidence: ${pct}%`}>
      {score > 0 ? `${pct}%` : '0%'}
    </span>
  );
}

/**
 * Returns the CSS class name for input border highlights.
 */
export function confFieldClass(score) {
  if (score === null || score === undefined || score === 0) return 'conf-input-wrap';
  if (score >= 0.80) return 'conf-input-wrap conf-high';
  if (score >= 0.60) return 'conf-input-wrap conf-med';
  return 'conf-input-wrap conf-low';
}
