// ============================================================
// miniOS - Unified Memory Model
// ============================================================
//
// Layout da memoria (256 bytes por padrao):
//
//   Endereco 0                                   Endereco 255
//   ┌──────────────────┬──────────┬──────────────────┐
//   │   HEAP -->       │ (livre)  │      <-- STACK   │
//   │   cresce -->     │          │      <-- cresce  │
//   └──────────────────┴──────────┴──────────────────┘
//   ^                                                ^
//   HP (Heap Pointer)                     SP (Stack Pointer)
//
// Stack Frame layout (cresce para baixo):
//   [ FP anterior      ] <-- FP aponta aqui
//   [ end. de retorno  ]
//   [ variavel local 0 ]
//   [ variavel local 1 ]
//   [ ...              ] <-- SP aponta aqui (proximo livre)

export const WORD_SIZE_IN_BYTES = 4;

export const DEFAULT_MEMORY_SIZE = 256;

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
