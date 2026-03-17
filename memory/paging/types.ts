export const PAGE_SIZE = 16;
export const VIRTUAL_ADDRESS_SPACE = 1024;
export const MAX_PHYSICAL_PAGES = 64;

export interface PhysicalFrame {
    id: number;
    data: Uint8Array;
}

export interface PageTableEntry {
    valid: boolean;
    physicalFrameId: number;
    dirty: boolean;
    accessed: boolean;
}

export interface PagingStats {
    totalPageFaults: number;
    totalAccesses: number;
    physicalFramesAllocated: number;
    physicalFramesMax: number;
}
