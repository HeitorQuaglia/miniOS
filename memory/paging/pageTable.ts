import type { PageTableEntry } from "./types";

export const createPageTable = (virtualPageCount: number) => {
    const entries: PageTableEntry[] = Array.from({ length: virtualPageCount }, () => ({
        valid: false,
        physicalFrameId: -1,
        dirty: false,
        accessed: false,
    }));

    const lookup = (pageNumber: number): PageTableEntry => {
        if (pageNumber < 0 || pageNumber >= virtualPageCount) {
            throw new Error(`Pagina virtual ${pageNumber} fora do espaco de enderecamento (0-${virtualPageCount - 1})`);
        }
        return entries[pageNumber];
    };

    const map = (pageNumber: number, frameId: number): void => {
        const entry = lookup(pageNumber);
        entry.valid = true;
        entry.physicalFrameId = frameId;
        entry.dirty = false;
        entry.accessed = false;
    };

    const unmap = (pageNumber: number): void => {
        const entry = lookup(pageNumber);
        entry.valid = false;
        entry.physicalFrameId = -1;
        entry.dirty = false;
        entry.accessed = false;
    };

    const getEntries = (): ReadonlyArray<PageTableEntry> => entries;

    return { lookup, map, unmap, getEntries };
};
