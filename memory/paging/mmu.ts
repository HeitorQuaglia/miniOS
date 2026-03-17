import { PAGE_SIZE, VIRTUAL_ADDRESS_SPACE, MAX_PHYSICAL_PAGES } from "./types";
import type { PhysicalFrame, PagingStats } from "./types";
import { createPageTable } from "./pageTable";
import { createPhysicalMemory } from "./physicalMemory";

export const createMMU = (config?: {
    pageSize?: number;
    virtualSize?: number;
    maxPhysicalPages?: number;
}) => {
    const pageSize = config?.pageSize ?? PAGE_SIZE;
    const virtualSize = config?.virtualSize ?? VIRTUAL_ADDRESS_SPACE;
    const maxPhysical = config?.maxPhysicalPages ?? MAX_PHYSICAL_PAGES;
    const virtualPageCount = Math.ceil(virtualSize / pageSize);

    const pageTable = createPageTable(virtualPageCount);
    const physicalMemory = createPhysicalMemory(maxPhysical, pageSize);

    const stats: PagingStats = {
        totalPageFaults: 0,
        totalAccesses: 0,
        physicalFramesAllocated: 0,
        physicalFramesMax: maxPhysical,
    };

    const translate = (virtualAddress: number): { frame: PhysicalFrame; offset: number } => {
        const pageNumber = Math.floor(virtualAddress / pageSize);
        const offset = virtualAddress % pageSize;

        stats.totalAccesses++;

        const entry = pageTable.lookup(pageNumber);
        if (!entry.valid) {
            // PAGE FAULT — demand paging
            stats.totalPageFaults++;
            const newFrame = physicalMemory.allocateFrame();
            pageTable.map(pageNumber, newFrame.id);
            stats.physicalFramesAllocated = physicalMemory.getAllocatedCount();
        }

        const mappedEntry = pageTable.lookup(pageNumber);
        mappedEntry.accessed = true;

        return {
            frame: physicalMemory.getFrame(mappedEntry.physicalFrameId),
            offset,
        };
    };

    const readByte = (address: number): number => {
        if (address < 0 || address >= virtualSize) {
            throw new Error(`Leitura fora dos limites: endereco ${address}`);
        }
        const { frame, offset } = translate(address);
        return frame.data[offset];
    };

    const writeByte = (address: number, value: number): void => {
        if (address < 0 || address >= virtualSize) {
            throw new Error(`Escrita fora dos limites: endereco ${address}`);
        }
        const { frame, offset } = translate(address);
        frame.data[offset] = value & 0xFF;

        const pageNumber = Math.floor(address / pageSize);
        pageTable.lookup(pageNumber).dirty = true;
    };

    const readWord = (address: number): number => {
        if (address < 0 || address + 4 > virtualSize) {
            throw new Error(`Leitura fora dos limites: endereco ${address}`);
        }
        return (
            readByte(address) |
            (readByte(address + 1) << 8) |
            (readByte(address + 2) << 16) |
            (readByte(address + 3) << 24)
        ) >>> 0;
    };

    const writeWord = (address: number, value: number): void => {
        if (address < 0 || address + 4 > virtualSize) {
            throw new Error(`Escrita fora dos limites: endereco ${address}`);
        }
        writeByte(address,      value        & 0xFF);
        writeByte(address + 1, (value >> 8)  & 0xFF);
        writeByte(address + 2, (value >> 16) & 0xFF);
        writeByte(address + 3, (value >> 24) & 0xFF);
    };

    const fillRange = (start: number, end: number, value: number): void => {
        for (let addr = start; addr < end; addr++) {
            writeByte(addr, value);
        }
    };

    const getStats = (): PagingStats => ({ ...stats });

    const dumpPageTable = (): void => {
        const entries = pageTable.getEntries();
        console.log(`\n=== Page Table (${virtualPageCount} paginas virtuais, ${pageSize} bytes/pagina) ===`);
        console.log(
            `Frames fisicos: ${physicalMemory.getAllocatedCount()}/${maxPhysical} ` +
            `(${physicalMemory.getTotalPhysicalBytes()} bytes alocados)`
        );
        console.log(
            `Page faults: ${stats.totalPageFaults} | ` +
            `Acessos: ${stats.totalAccesses} | ` +
            `Hit rate: ${stats.totalAccesses > 0
                ? (((stats.totalAccesses - stats.totalPageFaults) / stats.totalAccesses) * 100).toFixed(1)
                : 0}%`
        );
        console.log("");

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.valid) {
                const flags = [
                    entry.dirty ? "D" : "-",
                    entry.accessed ? "A" : "-",
                ].join("");
                console.log(
                    `  Pagina ${i.toString().padStart(3)} ` +
                    `(virtual ${(i * pageSize).toString().padStart(4)}-${((i + 1) * pageSize - 1).toString().padStart(4)}) ` +
                    `-> Frame ${entry.physicalFrameId.toString().padStart(3)} [${flags}]`
                );
            }
        }
        console.log("=".repeat(50) + "\n");
    };

    return { readWord, writeWord, readByte, writeByte, fillRange, getStats, dumpPageTable };
};

export type MMUBuffer = ReturnType<typeof createMMU>;
