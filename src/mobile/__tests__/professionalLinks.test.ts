import { describe, expect, it } from 'vitest';

import {
  buildLeadProfessionalLinkInserts,
  dedupeLeadProfessionalLinks,
  preservedLeadProfessionalIds,
  staleLeadProfessionalIds,
} from '@/mobile/lib/professionalLinks';

describe('lead_professionals junction rows', () => {
  it('keeps a professional only once', () => {
    const links = dedupeLeadProfessionalLinks([
      { professional_id: 'p1', is_primary_contact: true, contact_designation: 'Architect' },
      { professional_id: 'p1', is_primary_contact: false, contact_designation: 'Architect' },
    ]);
    expect(links).toHaveLength(1);
  });

  it('lets the primary contact win a duplicate professional id', () => {
    const links = dedupeLeadProfessionalLinks([
      { professional_id: 'p1', is_primary_contact: false, contact_designation: 'Site Contact' },
      { professional_id: 'p1', is_primary_contact: true, contact_designation: 'Architect' },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0].is_primary_contact).toBe(true);
    expect(links[0].contact_designation).toBe('Architect');
  });

  it('never emits a row without a professional id', () => {
    const links = dedupeLeadProfessionalLinks([
      { professional_id: '', is_primary_contact: true, contact_designation: 'Architect' },
    ]);
    expect(links).toHaveLength(0);
  });

  it('tolerates a missing list', () => {
    expect(dedupeLeadProfessionalLinks(null)).toEqual([]);
    expect(dedupeLeadProfessionalLinks(undefined)).toEqual([]);
  });

  it('builds the insert rows for the lead', () => {
    const rows = buildLeadProfessionalLinkInserts('l1', [
      { professional_id: 'p1', is_primary_contact: true, contact_designation: 'Architect' },
      { professional_id: 'p2', is_primary_contact: false, contact_designation: 'Contractor' },
    ]);
    expect(rows).toEqual([
      {
        lead_id: 'l1',
        professional_id: 'p1',
        is_primary_contact: true,
        contact_designation: 'Architect',
      },
      {
        lead_id: 'l1',
        professional_id: 'p2',
        is_primary_contact: false,
        contact_designation: 'Contractor',
      },
    ]);
  });

  it('produces a single row per professional for the upsert', () => {
    // Postgres rejects an `ON CONFLICT DO UPDATE` that touches the same row
    // twice (`21000`).
    const rows = buildLeadProfessionalLinkInserts('l1', [
      { professional_id: 'p1', is_primary_contact: true, contact_designation: 'Architect' },
      { professional_id: 'p1', is_primary_contact: false, contact_designation: 'Architect' },
    ]);
    expect(rows).toHaveLength(1);
    expect(new Set(rows.map((row) => row.professional_id)).size).toBe(rows.length);
  });
});

describe('junction cleanup on edit', () => {
  it('keeps a professional that is still in Group 1', () => {
    const preserved = preservedLeadProfessionalIds(['p1', 'p2'], null);
    expect(preserved.has('p1')).toBe(true);
    expect(preserved.has('p2')).toBe(true);
  });

  it('keeps the Group 3 referrer', () => {
    const preserved = preservedLeadProfessionalIds(['p1'], 'p9');
    expect(preserved.has('p9')).toBe(true);
  });

  it('deletes only the rows that are no longer referenced', () => {
    const preserved = preservedLeadProfessionalIds(['p1'], 'p9');
    expect(staleLeadProfessionalIds(['p1', 'p2', 'p9'], preserved)).toEqual(['p2']);
  });

  it('deletes nothing when every row is still referenced', () => {
    const preserved = preservedLeadProfessionalIds(['p1', 'p2'], null);
    expect(staleLeadProfessionalIds(['p1', 'p2'], preserved)).toEqual([]);
  });
});
