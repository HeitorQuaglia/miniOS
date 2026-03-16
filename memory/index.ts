import { DEFAULT_MEMORY_SIZE, type Registers, type HeapBlock } from "./types";
import { createBuffer } from "./buffer";
import { createStack } from "./stack";
import { createHeap } from "./heap";
import { createMemoryDump } from "./dump";

export const createMemory = (totalSizeInBytes: number = DEFAULT_MEMORY_SIZE) => {
    const buffer = createBuffer(totalSizeInBytes);

    const registers: Registers = {
        stackPointer: totalSizeInBytes,
        framePointer: totalSizeInBytes,
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

    const stack = createStack(buffer, registers, totalSizeInBytes, checkCollision);
    const heap = createHeap(buffer, registers, allocatedBlocks, checkCollision);
    const dump = createMemoryDump(buffer, registers, allocatedBlocks, totalSizeInBytes);

    return {
        readWord: buffer.readWord,
        writeWord: buffer.writeWord,
        readByte: buffer.readByte,
        writeByte: buffer.writeByte,

        stackPush: stack.push,
        stackPop: stack.pop,
        stackPeek: stack.peek,
        pushFrame: stack.pushFrame,
        popFrame: stack.popFrame,

        heapAlloc: heap.allocate,
        heapFree: heap.free,

        getRegisters: (): Registers => ({ ...registers }),
        dump,
    };
};

export { WORD_SIZE_IN_BYTES, DEFAULT_MEMORY_SIZE } from "./types";
export type { Registers, HeapBlock } from "./types";
