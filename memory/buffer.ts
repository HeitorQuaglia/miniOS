import { WORD_SIZE_IN_BYTES } from "./types";

export const createBuffer = (totalSizeInBytes: number) => {
    const rawBuffer = new Uint8Array(totalSizeInBytes);

    const writeWord = (address: number, value: number) => {
        if (address < 0 || address + WORD_SIZE_IN_BYTES > totalSizeInBytes) {
            throw new Error(`Escrita fora dos limites: endereco ${address}`);
        }
        // little-endian: byte menos significativo primeiro
        rawBuffer[address]     =  value        & 0xFF;
        rawBuffer[address + 1] = (value >> 8)  & 0xFF;
        rawBuffer[address + 2] = (value >> 16) & 0xFF;
        rawBuffer[address + 3] = (value >> 24) & 0xFF;
    };

    const readWord = (address: number): number => {
        if (address < 0 || address + WORD_SIZE_IN_BYTES > totalSizeInBytes) {
            throw new Error(`Leitura fora dos limites: endereco ${address}`);
        }
        return (
            rawBuffer[address] |
            (rawBuffer[address + 1] << 8) |
            (rawBuffer[address + 2] << 16) |
            (rawBuffer[address + 3] << 24)
        ) >>> 0; // unsigned
    };

    const writeByte = (address: number, value: number) => {
        if (address < 0 || address >= totalSizeInBytes) {
            throw new Error(`Escrita fora dos limites: endereco ${address}`);
        }
        rawBuffer[address] = value & 0xFF;
    };

    const readByte = (address: number): number => {
        if (address < 0 || address >= totalSizeInBytes) {
            throw new Error(`Leitura fora dos limites: endereco ${address}`);
        }
        return rawBuffer[address];
    };

    const fillRange = (start: number, end: number, value: number) => {
        rawBuffer.fill(value, start, end);
    };

    return { readWord, writeWord, readByte, writeByte, fillRange };
};

export type MemoryBuffer = ReturnType<typeof createBuffer>;
