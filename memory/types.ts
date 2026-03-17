// ============================================================
// miniOS - Virtual Memory Model (Paginacao por Demanda)
// ============================================================
//
// Espaco de enderecamento virtual (1024 bytes por padrao):
//
//   Endereco 0                                 Endereco 1023
//   ┌──────────────────┬──────────┬──────────────────┐
//   │   HEAP -->       │ (livre)  │      <-- STACK   │
//   │   cresce -->     │          │      <-- cresce  │
//   └──────────────────┴──────────┴──────────────────┘
//   ^                                                ^
//   HP (Heap Pointer)                     SP (Stack Pointer)
//
// Memoria fisica alocada sob demanda via MMU (paginas de 16 bytes).
// Apenas paginas acessadas consomem memoria real (demand paging).
//
// Stack Frame layout (cresce para baixo):
//   [ FP anterior      ] <-- FP aponta aqui
//   [ end. de retorno  ]
//   [ variavel local 0 ]
//   [ variavel local 1 ]
//   [ ...              ] <-- SP aponta aqui (proximo livre)

export const WORD_SIZE_IN_BYTES = 4;

export const DEFAULT_VIRTUAL_MEMORY_SIZE = 1024;

export interface MemoryBuffer {
    readWord: (address: number) => number;
    writeWord: (address: number, value: number) => void;
    readByte: (address: number) => number;
    writeByte: (address: number, value: number) => void;
    fillRange: (start: number, end: number, value: number) => void;
}

export interface Registers {
    stackPointer: number;
    framePointer: number;
    heapPointer: number;
}

export interface HeapBlock {
    startAddress: number;
    sizeInBytes: number;
    isFree: boolean;
}
