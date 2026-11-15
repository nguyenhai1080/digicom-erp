import { createHash } from 'node:crypto';
const approvalPin = 'a75b0238c43d73b8192fa1d26fdbb5bc99415266d75f4a3beb8c16833833d369';
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const canonical = (v) => JSON.stringify(sorted(v));
const digest = (v) => createHash('sha256').update(canonical(v)).digest('hex');
const address = (a) => ({ sheet: a.sheet, sheetId: a.sheetId, sourceRow: a.sourceRow, legacyId: a.legacyId, expectedRowHash: a.rowHash });
// Only the three immutable owner decisions of 23 October are recognized.
// A self-consistent, rehashed replacement envelope is never authorization.
// This resolves a source link, not amounts, dates, lifecycle or acceptance.
export function historicalOwnerApprovedRevenueLink(input) {
    try {
        if (typeof input.envelopeJson !== 'string' || Buffer.byteLength(input.envelopeJson) > 64 * 1024)
            return null;
        const e = JSON.parse(input.envelopeJson), { approvalHash, ...body } = e;
        if (canonical(e) !== input.envelopeJson || approvalHash !== approvalPin || digest(body) !== approvalPin || e.snapshotHash !== input.snapshotHash || e.format !== 'dgc-financial-link-decisions-v1')
            return null;
        const matches = e.proposal.proposals.filter((p) => canonical({ ...address(input.source), field: 'Revenue_ID', expectedValue: input.capturedRevenueId }) === canonical(p.source) && canonical(address(input.target)) === canonical(p.target) && p.evidence.invoiceId === input.invoiceId && p.evidence.fileId === input.pdfFileId && p.evidence.sha256 === input.pdfSha256);
        if (matches.length !== 1)
            return null;
        return { state: 'OWNER_APPROVED_LINK', approvalHash: approvalPin, proposalHash: e.proposal.proposalHash, source: matches[0].source, target: matches[0].target, sourceChanged: false, moneyChanged: false, datesChanged: false, pdfsChanged: false };
    }
    catch {
        return null;
    }
}
