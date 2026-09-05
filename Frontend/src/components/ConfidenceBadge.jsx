import React from 'react';

/**
 * ConfidenceBadge — shows a color-coded pill for a confidence score.
 * score >= 0.90 → green
 * score >= 0.70 → amber
 * score <  0.70 → red
 * score null/0  → gray
 */
export default function ConfidenceBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="conf-badge gray">—</span>;
  }

  let cls, label;
  if (score >= 0.90) {
    cls = 'green'; label = `${Math.round(score * 100)}%`;
  } else if (score >= 0.70) {
    cls = 'amber'; label = `${Math.round(score * 100)}%`;
  } else if (score > 0) {
    cls = 'red';   label = `${Math.round(score * 100)}%`;
  } else {
    cls = 'gray';  label = '—';
  }

  return <span className={`conf-badge ${cls}`}>{label}</span>;
}

/** Returns the CSS class name for conf-field wrapper */
export function confFieldClass(score) {
  if (score === null || score === undefined || score === 0) return '';
  if (score >= 0.90) return 'conf-field conf-green';
  if (score >= 0.70) return 'conf-field conf-amber';
  return 'conf-field conf-red';
}
