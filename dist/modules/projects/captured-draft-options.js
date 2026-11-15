// Parallel donor Draft options are retained. Issuance uses the selected option
// for its source set and the latest captured option for each other source set.
// No invoice, amount, current flag or source status is changed by selection.
export function capturedDraftOptions(drafts, selectedId) {
    const selected = drafts.find(i => i.id === selectedId);
    if (selected?.snapshot?.sourceKind !== 'DGC_CAPTURED_BOOK_V1')
        return drafts;
    const groups = new Map();
    for (const d of drafts) {
        const key = d.scopes.flatMap(s => s.items.map(i => i.revenueId)).sort().join('|');
        if (!key)
            return drafts;
        const group = groups.get(key) ?? [];
        group.push(d);
        groups.set(key, group);
    }
    return [...groups.values()].flatMap(group => {
        if (group.length === 1 || group.some(i => i.snapshot?.sourceKind !== 'DGC_CAPTURED_BOOK_V1'))
            return group;
        return [group.find(i => i.id === selectedId) ?? group.reduce((a, b) => Number(a.snapshot.source.sourceRow) > Number(b.snapshot.source.sourceRow) ? a : b)];
    });
}
