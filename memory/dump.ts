import { WORD_SIZE_IN_BYTES, type MemoryBuffer, type Registers, type HeapBlock } from "./types";
import type { PagingStats } from "./paging";

export const createMemoryDump = (
    buffer: MemoryBuffer,
    registers: Registers,
    allocatedBlocks: HeapBlock[],
    totalSizeInBytes: number,
    pagingInfo?: {
        dumpPageTable: () => void;
        getStats: () => PagingStats;
    } | null,
) => {
    return () => {
        const usedByHeap = registers.heapPointer;
        const usedByStack = totalSizeInBytes - registers.stackPointer;
        const freeBytes = registers.stackPointer - registers.heapPointer;

        console.log(`\n=== Memory Dump (${totalSizeInBytes} bytes) ===`);
        console.log(
            `HP = ${registers.heapPointer} | ` +
            `SP = ${registers.stackPointer} | ` +
            `FP = ${registers.framePointer}`
        );
        console.log(
            `Heap: ${usedByHeap}b | ` +
            `Stack: ${usedByStack}b | ` +
            `Livre: ${freeBytes}b`
        );

        if (pagingInfo) {
            const stats = pagingInfo.getStats();
            const hitRate = stats.totalAccesses > 0
                ? (((stats.totalAccesses - stats.totalPageFaults) / stats.totalAccesses) * 100).toFixed(1)
                : "0.0";
            console.log(
                `\n[PAGINACAO]` +
                `\n  Frames fisicos: ${stats.physicalFramesAllocated}/${stats.physicalFramesMax}` +
                `\n  Page faults: ${stats.totalPageFaults}` +
                `\n  Acessos totais: ${stats.totalAccesses}` +
                `\n  Hit rate: ${hitRate}%`
            );
        }

        console.log("\n[HEAP]");
        for (const block of allocatedBlocks) {
            const status = block.isFree ? "LIVRE" : "USADO";
            const words: number[] = [];
            for (let offset = 0; offset < block.sizeInBytes; offset += WORD_SIZE_IN_BYTES) {
                words.push(buffer.readWord(block.startAddress + offset));
            }
            console.log(
                `  @${block.startAddress} ` +
                `(${block.sizeInBytes}b) ` +
                `[${status}] = [${words.join(", ")}]`
            );
        }

        console.log("\n[STACK]");
        for (let address = registers.stackPointer; address < totalSizeInBytes; address += WORD_SIZE_IN_BYTES) {
            const label =
                address === registers.framePointer ? " <-- FP" :
                address === registers.stackPointer ? " <-- SP" : "";
            console.log(`  @${address} = ${buffer.readWord(address)}${label}`);
        }

        if (pagingInfo) {
            pagingInfo.dumpPageTable();
        }

        console.log("=".repeat(40) + "\n");
    };
};
