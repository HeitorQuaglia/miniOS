import { WORD_SIZE_IN_BYTES, type Registers, type HeapBlock } from "./types";
import type { MemoryBuffer } from "./buffer";

export const createMemoryDump = (
    buffer: MemoryBuffer,
    registers: Registers,
    allocatedBlocks: HeapBlock[],
    totalSizeInBytes: number,
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

        console.log("=".repeat(40) + "\n");
    };
};
