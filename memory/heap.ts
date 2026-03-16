import { WORD_SIZE_IN_BYTES, type Registers, type HeapBlock } from "./types";
import type { MemoryBuffer } from "./buffer";

export const createHeap = (
    buffer: MemoryBuffer,
    registers: Registers,
    allocatedBlocks: HeapBlock[],
    checkCollision: () => void,
) => {
    const alignToWord = (sizeInBytes: number): number =>
        Math.ceil(sizeInBytes / WORD_SIZE_IN_BYTES) * WORD_SIZE_IN_BYTES;

    const allocate = (sizeInBytes: number): number => {
        const alignedSize = alignToWord(sizeInBytes);

        // first-fit: procura o primeiro bloco livre que caiba
        for (const block of allocatedBlocks) {
            if (block.isFree && block.sizeInBytes >= alignedSize) {
                block.isFree = false;
                return block.startAddress;
            }
        }

        // nenhum bloco reutilizavel — aloca no fim do heap
        const address = registers.heapPointer;
        registers.heapPointer += alignedSize;
        checkCollision();

        allocatedBlocks.push({
            startAddress: address,
            sizeInBytes: alignedSize,
            isFree: false,
        });

        return address;
    };

    const free = (address: number) => {
        const block = allocatedBlocks.find(b => b.startAddress === address);
        if (!block) {
            throw new Error(`Endereco ${address} nao foi alocado no heap`);
        }
        if (block.isFree) {
            throw new Error(`Double free detectado no endereco ${address}`);
        }
        block.isFree = true;
        buffer.fillRange(block.startAddress, block.startAddress + block.sizeInBytes, 0);
    };

    return { allocate, free };
};
