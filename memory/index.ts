import { DEFAULT_VIRTUAL_MEMORY_SIZE, type Registers, type HeapBlock } from "./types";
import { createStack } from "./stack";
import { createHeap } from "./heap";
import { createMemoryDump } from "./dump";
import { createMMU } from "./paging";
import type { PagingStats } from "./paging";

export interface MemoryConfig {
    pageSize?: number;
    virtualSize?: number;
    maxPhysicalPages?: number;
}

export const createMemory = (config?: MemoryConfig) => {
    const virtualSize = config?.virtualSize ?? DEFAULT_VIRTUAL_MEMORY_SIZE;

    const mmu = createMMU({
        pageSize: config?.pageSize,
        virtualSize,
        maxPhysicalPages: config?.maxPhysicalPages,
    });

    const registers: Registers = {
        stackPointer: virtualSize,
        framePointer: virtualSize,
        heapPointer: 0,
    };

    const allocatedBlocks: HeapBlock[] = [];

    const checkCollision = () => {
        if (registers.heapPointer > registers.stackPointer) {
            throw new Error(
                `Colisao de memoria! HP=${registers.heapPointer} ultrapassou SP=${registers.stackPointer}. ` +
                `Stack e Heap colidiram.`
            );
        }
    };

    const stack = createStack(mmu, registers, virtualSize, checkCollision);
    const heap = createHeap(mmu, registers, allocatedBlocks, checkCollision);
    const dump = createMemoryDump(mmu, registers, allocatedBlocks, virtualSize, {
        dumpPageTable: mmu.dumpPageTable,
        getStats: mmu.getStats,
    });

    return {
        readWord: mmu.readWord,
        writeWord: mmu.writeWord,
        readByte: mmu.readByte,
        writeByte: mmu.writeByte,

        stackPush: stack.push,
        stackPop: stack.pop,
        stackPeek: stack.peek,
        pushFrame: stack.pushFrame,
        popFrame: stack.popFrame,

        heapAlloc: heap.allocate,
        heapFree: heap.free,

        getRegisters: (): Registers => ({ ...registers }),
        dump,

        dumpPageTable: mmu.dumpPageTable,
        getPagingStats: mmu.getStats,
    };
};

export { WORD_SIZE_IN_BYTES, DEFAULT_VIRTUAL_MEMORY_SIZE } from "./types";
export type { MemoryBuffer, Registers, HeapBlock } from "./types";
export type { PagingStats } from "./paging";
