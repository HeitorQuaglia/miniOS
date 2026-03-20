# Arrays C-like e Pseudo-Syscalls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add C-like arrays (stack + heap, `arr[i]` syntax, generic over all types) and ARM-style pseudo-syscalls (`sys_read`, `sys_write`, `sys_exit`) to miniOS.

**Architecture:** Arrays are always pointers to contiguous blocks — stack arrays reserve space in the frame, heap arrays use `alloc(N)`. Syscalls use a single `SYSCALL` opcode with ARM convention (syscall number in R0, args in R1-R3). External I/O buffers live in a `SyscallHandler` object injected into the CPU.

**Tech Stack:** TypeScript, no test framework (verification via `npm run build` + manual test programs)

**Spec:** `docs/superpowers/specs/2026-03-20-arrays-and-syscalls-design.md`

**Important language note:** The miniOS language does NOT have a `let` keyword. Variable declarations use the syntax `name: type = expr` (e.g., `scores: number[4] = 0`). The parser detects declarations by the `IDENTIFIER COLON` pattern.

---

## File Structure

### Files to create:
- `cpu/syscall.ts` — `SyscallHandler` interface, `createSyscallHandler()` factory, handler dispatch

### Files to modify:
- `compiler/tokens.ts` — Add `LBRACKET`, `RBRACKET` tokens
- `compiler/lexer.ts` — Emit `[` and `]` tokens
- `compiler/ast.ts` — Add `ArrayType`, `IndexAccess`, extend `AllocExpression`
- `compiler/parser.ts` — Parse `T[N]` types, `expr[expr]` access, `arr[i] = expr`, `alloc(N)` for arrays, syscall built-in calls
- `compiler/codegen.ts` — Stack array allocation, index access read/write, heap array alloc, syscall built-in codegen
- `cpu/types.ts` — Add `SYSCALL` opcode
- `cpu/executor.ts` — Add `SYSCALL` case dispatching to handler
- `cpu/index.ts` — Accept optional `syscallHandler` in `createCpu`, re-export syscall types
- `index.ts` — Re-export `createSyscallHandler` and types

---

## Task 1: Add `[` and `]` tokens to lexer

**Files:**
- Modify: `compiler/tokens.ts:40-51`
- Modify: `compiler/lexer.ts:78-119`

- [ ] **Step 1: Add token types**

In `compiler/tokens.ts`, add to the delimiters section (after `COMMA`):

```typescript
LBRACKET = "[",
RBRACKET = "]",
```

No keyword entry needed — these are single-character delimiters.

- [ ] **Step 2: Add lexer cases**

In `compiler/lexer.ts`, add cases in the switch statement (after the `","` case, before `";"`:

```typescript
case "[": addToken(TokenType.LBRACKET, ch); break;
case "]": addToken(TokenType.RBRACKET, ch); break;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 4: Commit**

```bash
git add compiler/tokens.ts compiler/lexer.ts
git commit -m "feat: add bracket tokens to lexer"
```

---

## Task 2: Add `ArrayType` and `IndexAccess` to AST

**Files:**
- Modify: `compiler/ast.ts:7-9,48-52,116-125,149-158`

- [ ] **Step 1: Extend `TypeNode` with array type**

In `compiler/ast.ts`, change the `TypeNode` union to:

```typescript
export type TypeNode =
    | { kind: "primitive"; name: "number" | "char" }
    | { kind: "ref"; innerTypeName: string }
    | { kind: "array"; elementType: TypeNode; size: number };
```

- [ ] **Step 2: Add `IndexAccess` expression node**

Add after the `FieldAccess` interface:

```typescript
export interface IndexAccess {
    kind: "indexAccess";
    object: Expression;
    index: Expression;
}
```

- [ ] **Step 3: Extend `AllocExpression` for arrays**

Change `AllocExpression` to support both struct and array alloc:

```typescript
export interface AllocExpression {
    kind: "allocExpression";
    typeName: string;
    elementCount?: Expression;
}
```

When `elementCount` is present, this is an array heap alloc (`alloc(N)`). When absent, it's a struct alloc (`alloc(StructName)`).

- [ ] **Step 4: Add `IndexAccess` to `Expression` union**

```typescript
export type Expression =
    | NumberLiteral
    | Identifier
    | BinaryExpression
    | ComparisonExpression
    | LogicalExpression
    | UnaryExpression
    | FunctionCall
    | FieldAccess
    | IndexAccess
    | AllocExpression;
```

- [ ] **Step 5: Add `IndexAccess` as valid assignment target**

Update the `Assignment` interface comment:

```typescript
export interface Assignment {
    kind: "assignment";
    target: Expression; // Identifier, FieldAccess, or IndexAccess
    value: Expression;
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Errors in `codegen.ts` because `compileExpression` switch doesn't handle `indexAccess`. That's expected — we'll fix it in Task 5. For now confirm the AST types compile.

- [ ] **Step 7: Commit**

```bash
git add compiler/ast.ts
git commit -m "feat: add ArrayType and IndexAccess to AST"
```

---

## Task 3: Parse array types, index access, and array alloc

**Files:**
- Modify: `compiler/parser.ts:36-48,175-182,278-287,297-304`

- [ ] **Step 1: Parse `T[N]` in `parseType`**

Replace `parseType` function. After parsing a base type (`number`, `char`, or `ref<...>`), check for `[N]` suffix:

```typescript
const parseType = (): TypeNode => {
    let baseType: TypeNode;
    if (match(TokenType.NUMBER_TYPE)) {
        baseType = { kind: "primitive", name: "number" };
    } else if (match(TokenType.CHAR_TYPE)) {
        baseType = { kind: "primitive", name: "char" };
    } else if (match(TokenType.REF)) {
        expect(TokenType.LANGLE, "ref type");
        const name = expect(TokenType.IDENTIFIER, "ref type").value;
        expect(TokenType.RANGLE, "ref type");
        baseType = { kind: "ref", innerTypeName: name };
    } else {
        throw new Error(
            `Tipo inesperado '${current().value}' na linha ${current().line}:${current().column}`
        );
    }

    // Check for array suffix: T[N]
    if (current().type === TokenType.LBRACKET) {
        pos++;
        const sizeToken = expect(TokenType.NUMBER_LITERAL, "array size");
        const size = parseInt(sizeToken.value, 10);
        if (size < 1) {
            throw new Error(
                `Tamanho de array deve ser >= 1, encontrou ${size} na linha ${sizeToken.line}:${sizeToken.column}`
            );
        }
        expect(TokenType.RBRACKET, "array type");
        return { kind: "array", elementType: baseType, size };
    }

    return baseType;
};
```

- [ ] **Step 2: Parse `expr[expr]` in `parsePostfix`**

Extend `parsePostfix` to handle both `.field` and `[index]`:

```typescript
const parsePostfix = (): Expression => {
    let expr = parsePrimary();
    while (current().type === TokenType.DOT || current().type === TokenType.LBRACKET) {
        if (current().type === TokenType.DOT) {
            pos++;
            const field = expect(TokenType.IDENTIFIER, "field access").value;
            expr = { kind: "fieldAccess", object: expr, field };
        } else {
            pos++; // consume [
            const index = parseExpression();
            expect(TokenType.RBRACKET, "index access");
            expr = { kind: "indexAccess", object: expr, index };
        }
    }
    return expr;
};
```

- [ ] **Step 3: Handle `arr[i] = expr` in assignment parsing**

No change needed — the existing `parseStatement` already parses `expr = value` as assignment, and `expr` can now be an `IndexAccess` thanks to Step 2. The `Assignment.target` already accepts any `Expression`.

- [ ] **Step 4: Parse `alloc(N)` for array heap allocation**

Extend the `alloc` parsing in `parsePrimary`. Currently it expects `alloc(Identifier)`. We need to also support `alloc(NumberLiteral)` for array heap allocation:

```typescript
// alloc(TypeName) or alloc(N) for arrays
if (current().type === TokenType.ALLOC) {
    pos++;
    expect(TokenType.LPAREN, "alloc");
    if (current().type === TokenType.NUMBER_LITERAL) {
        const countExpr = parseExpression();
        expect(TokenType.RPAREN, "alloc");
        return { kind: "allocExpression", typeName: "", elementCount: countExpr };
    }
    const typeName = expect(TokenType.IDENTIFIER, "alloc type").value;
    expect(TokenType.RPAREN, "alloc");
    return { kind: "allocExpression", typeName };
}
```

- [ ] **Step 5: Handle variable declaration with array type (no initializer)**

The current parser requires `name: type = expr` for variable declarations. Stack arrays (`scores: number[4]`) don't need an initializer — the array is allocated inline. We need to make the `= expr` part optional when the type is an array:

In `parseStatement`, modify the variable declaration branch:

```typescript
// variableDeclaration:  ident : type = expr  OR  ident : arrayType (no initializer)
if (current().type === TokenType.IDENTIFIER && peek(1).type === TokenType.COLON) {
    const name = expect(TokenType.IDENTIFIER, "var name").value;
    expect(TokenType.COLON, "var type");
    const type = parseType();
    if (type.kind === "array" && current().type !== TokenType.EQUALS) {
        // Stack array: no initializer needed
        return { kind: "variableDeclaration", name, type, initializer: { kind: "numberLiteral", value: 0 } };
    }
    expect(TokenType.EQUALS, "var initializer");
    const initializer = parseExpression();
    return { kind: "variableDeclaration", name, type, initializer };
}
```

The dummy initializer (`0`) will be ignored by the codegen for array types — the codegen will emit its own allocation sequence.

- [ ] **Step 6: Update parser imports**

Add `IndexAccess` to the imports from `./ast` at the top of `parser.ts`:

```typescript
import type {
    Program, Declaration, StructDeclaration, FunctionDeclaration,
    StructField, FunctionParameter, TypeNode,
    Statement, Expression, IfStatement, WhileStatement,
    ComparisonOperator, IndexAccess,
} from "./ast";
```

(The `IndexAccess` import is optional since we construct it as an object literal, but good for documentation.)

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: May have errors in codegen (unhandled `indexAccess` case). That's OK.

- [ ] **Step 8: Commit**

```bash
git add compiler/parser.ts
git commit -m "feat: parse array types, index access, and array alloc"
```

---

## Task 4: Codegen — stack array allocation

**Files:**
- Modify: `compiler/codegen.ts:271-309` (the `variableDeclaration` case in `compileStatement`)

- [ ] **Step 0: Add `sp` to codegen imports**

In `compiler/codegen.ts` line 1, add `sp` to the import:

```typescript
import { Opcode, reg, fp, sp, imm, memReg, type Instruction } from "../cpu";
```

- [ ] **Step 1: Extend `TypedFunctionContext` to track array info**

Add array type tracking so the codegen knows which variables are arrays and their sizes. In `codegen.ts`, update the `localTypes` map value type to include array info:

```typescript
interface TypedFunctionContext extends FunctionContext {
    paramTypes: Map<string, { kind: string; innerTypeName?: string; arraySize?: number }>;
    localTypes: Map<string, { kind: string; innerTypeName?: string; arraySize?: number }>;
}
```

- [ ] **Step 2: Handle array variable declarations in `compileStatement`**

In the `variableDeclaration` case, add array handling before the existing scalar code:

```typescript
case "variableDeclaration": {
    if (stmt.type.kind === "array") {
        // Stack array: emit N PUSHes to reserve space, then push pointer
        const arraySize = stmt.type.size;
        // Initialize array elements to 0
        for (let i = 0; i < arraySize; i++) {
            emit(instructions, Opcode.PUSH, [imm(0)]);
        }
        // Compute address of first element.
        // After N PUSHes, SP points to the next free slot (below the block).
        // The block occupies addresses [SP+4 .. SP+N*4].
        // We set base = SP + WORD_SIZE (lowest address in block).
        // Then arr[i] = base + i*4 grows upward through the block.
        emit(instructions, Opcode.MOV, [reg("R0"), sp()]);
        emit(instructions, Opcode.ADD, [reg("R0"), imm(WORD_SIZE_IN_BYTES)]);
        // Push pointer as the variable
        emit(instructions, Opcode.PUSH, [reg("R0")]);
        // Register the variable location (the pointer)
        const offset = fnCtx.nextLocalOffset;
        fnCtx.nextLocalOffset -= WORD_SIZE_IN_BYTES;
        fnCtx.locals.set(stmt.name, { offsetFromFP: offset });
        fnCtx.localTypes.set(stmt.name, { kind: "array", arraySize });
        // Account for the N words consumed by the array data
        fnCtx.nextLocalOffset -= arraySize * WORD_SIZE_IN_BYTES;
        break;
    }

    // ... existing scalar variable code ...
```

- [ ] **Step 3: Update scalar variable type tracking for arrays-in-ref**

When a variable has type `ref` with an array inside (heap array), record it. Update the existing type tracking in the scalar path:

```typescript
    // existing code for scalar variables:
    compileExpression(stmt.initializer, instructions, fnCtx, ctx);
    emit(instructions, Opcode.PUSH, [reg("R0")]);
    const offset = fnCtx.nextLocalOffset;
    fnCtx.nextLocalOffset -= WORD_SIZE_IN_BYTES;
    fnCtx.locals.set(stmt.name, { offsetFromFP: offset });
    if (stmt.type.kind === "ref") {
        fnCtx.localTypes.set(stmt.name, { kind: "ref", innerTypeName: stmt.type.innerTypeName });
    } else {
        fnCtx.localTypes.set(stmt.name, { kind: "primitive" });
    }
    break;
```

No changes needed here — existing code already handles ref types correctly.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Still may have errors for unhandled `indexAccess` in `compileExpression`. That's next.

- [ ] **Step 5: Commit**

```bash
git add compiler/codegen.ts
git commit -m "feat: codegen for stack array allocation"
```

---

## Task 5: Codegen — index access (read and write)

**Files:**
- Modify: `compiler/codegen.ts` — `compileExpression` and `compileStatement` (assignment case)

- [ ] **Step 1: Add `indexAccess` case to `compileExpression`**

Add a new case in the `compileExpression` switch, after `fieldAccess`:

```typescript
case "indexAccess": {
    // Load array base pointer -> R0
    compileExpression(expr.object, instructions, fnCtx, ctx);
    emit(instructions, Opcode.PUSH, [reg("R0")]); // save base
    // Compile index expression -> R0
    compileExpression(expr.index, instructions, fnCtx, ctx);
    // R1 = index, compute byte offset
    emit(instructions, Opcode.MOV, [reg("R1"), reg("R0")]);
    emit(instructions, Opcode.MOV, [reg("R0"), imm(WORD_SIZE_IN_BYTES)]);
    emit(instructions, Opcode.MUL, [reg("R1"), reg("R0")]); // R1 = index * 4
    emit(instructions, Opcode.POP, [reg("R0")]); // R0 = base
    emit(instructions, Opcode.ADD, [reg("R0"), reg("R1")]); // R0 = base + index*4
    // Load value from computed address
    emit(instructions, Opcode.MOV, [reg("R2"), reg("R0")]);
    emit(instructions, Opcode.LOAD, [reg("R0"), memReg("R2")]);
    break;
}
```

- [ ] **Step 2: Add `indexAccess` assignment case to `compileStatement`**

In the `assignment` case of `compileStatement`, add handling for `IndexAccess` targets. Add this before the `else if (stmt.target.kind === "identifier")` branch:

```typescript
} else if (stmt.target.kind === "indexAccess") {
    // arr[i] = expr
    // 1. Compute destination address
    compileExpression(stmt.target.object, instructions, fnCtx, ctx);
    emit(instructions, Opcode.PUSH, [reg("R0")]); // save base
    compileExpression(stmt.target.index, instructions, fnCtx, ctx);
    emit(instructions, Opcode.MOV, [reg("R1"), reg("R0")]);
    emit(instructions, Opcode.MOV, [reg("R0"), imm(WORD_SIZE_IN_BYTES)]);
    emit(instructions, Opcode.MUL, [reg("R1"), reg("R0")]); // R1 = index * 4
    emit(instructions, Opcode.POP, [reg("R0")]); // R0 = base
    emit(instructions, Opcode.ADD, [reg("R0"), reg("R1")]); // R0 = dest addr
    emit(instructions, Opcode.PUSH, [reg("R0")]); // save dest addr
    // 2. Compile value
    compileExpression(stmt.value, instructions, fnCtx, ctx);
    // 3. Store
    emit(instructions, Opcode.POP, [reg("R2")]); // R2 = dest addr
    emit(instructions, Opcode.STORE, [memReg("R2"), reg("R0")]);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 4: Write a test program and verify arrays work**

Create `examples/array.example`:

```
fn main(): number {
    arr: number[3]
    arr[0] = 10
    arr[1] = 20
    arr[2] = 30
    return arr[0] + arr[1] + arr[2]
}
```

Temporarily modify the entry point or write a quick script to compile and run this. Expected result: `R0 = 60`.

- [ ] **Step 5: Commit**

```bash
git add compiler/codegen.ts examples/array.example
git commit -m "feat: codegen for array index read and write"
```

---

## Task 6: Codegen — heap array allocation via `alloc(N)`

**Files:**
- Modify: `compiler/codegen.ts` — `allocExpression` case in `compileExpression`

- [ ] **Step 1: Extend `allocExpression` case to handle array alloc**

Update the `allocExpression` case in `compileExpression`:

```typescript
case "allocExpression": {
    if (expr.elementCount) {
        // Array heap alloc: alloc(N) allocates N * WORD_SIZE bytes
        compileExpression(expr.elementCount, instructions, fnCtx, ctx);
        // R0 = element count, multiply by WORD_SIZE
        emit(instructions, Opcode.MOV, [reg("R1"), imm(WORD_SIZE_IN_BYTES)]);
        emit(instructions, Opcode.MUL, [reg("R0"), reg("R1")]); // R0 = N * 4
        // Move size to R1 so ALLOC can write result to R0
        emit(instructions, Opcode.MOV, [reg("R1"), reg("R0")]);
        emit(instructions, Opcode.ALLOC, [reg("R0"), reg("R1")]);
    } else {
        // Struct alloc
        const structInfo = ctx.structs.get(expr.typeName);
        if (!structInfo) throw new Error(`Struct '${expr.typeName}' nao definida`);
        emit(instructions, Opcode.ALLOC, [reg("R0"), imm(structInfo.sizeInBytes)]);
    }
    break;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 3: Write a test program for heap arrays**

Add to `examples/array.example` or create `examples/heap-array.example`:

```
fn main(): number {
    buf: ref<number> = alloc(3)
    // Manual write using the pointer directly isn't possible with current syntax
    // Heap arrays need ref<T[N]> type support — but for now alloc(N) returns a pointer
    // This will work once we have the ref type wired up
    return 0
}
```

Note: Full heap array support (`ref<number[3]>`) requires the `ref` type in the parser to support `ref<T[N]>`, which needs the parseType to handle `ref<number[3]>`. This is an extension of the existing ref parsing. For now, `alloc(N)` works standalone and returns a pointer that can be used with index access.

- [ ] **Step 4: Commit**

```bash
git add compiler/codegen.ts
git commit -m "feat: codegen for heap array allocation via alloc(N)"
```

---

## Task 7: Add `SYSCALL` opcode and `SyscallHandler`

**Files:**
- Modify: `cpu/types.ts:54-57`
- Create: `cpu/syscall.ts`

- [ ] **Step 1: Add `SYSCALL` to `Opcode` enum**

In `cpu/types.ts`, add to the sistema section:

```typescript
// sistema
NOP     = "NOP",
HALT    = "HALT",
SYSCALL = "SYSCALL",  // SYSCALL — chama handler de syscall (numero em R0)
```

- [ ] **Step 2: Create `cpu/syscall.ts`**

```typescript
import type { CpuState } from "./registers";
import type { createMemory } from "../memory";
import { WORD_SIZE_IN_BYTES } from "../memory";

type Memory = ReturnType<typeof createMemory>;

export interface SyscallHandler {
    inputBuffer: number[];
    outputBuffer: number[];
    exitCode: number | null;
    handleSyscall(state: CpuState, memory: Memory): void;
}

const SYSCALL_READ = 0;
const SYSCALL_WRITE = 1;
const SYSCALL_EXIT = 2;

export const createSyscallHandler = (): SyscallHandler => {
    const handler: SyscallHandler = {
        inputBuffer: [],
        outputBuffer: [],
        exitCode: null,

        handleSyscall(state: CpuState, memory: Memory): void {
            const syscallNumber = state.generalPurpose.R0;

            switch (syscallNumber) {
                case SYSCALL_READ: {
                    const destAddr = state.generalPurpose.R1;
                    const count = state.generalPurpose.R2;
                    const available = Math.min(count, handler.inputBuffer.length);
                    for (let i = 0; i < available; i++) {
                        const value = handler.inputBuffer.shift()!;
                        memory.writeWord(destAddr + i * WORD_SIZE_IN_BYTES, value);
                    }
                    state.generalPurpose.R0 = available;
                    break;
                }

                case SYSCALL_WRITE: {
                    const srcAddr = state.generalPurpose.R1;
                    const count = state.generalPurpose.R2;
                    for (let i = 0; i < count; i++) {
                        const value = memory.readWord(srcAddr + i * WORD_SIZE_IN_BYTES);
                        handler.outputBuffer.push(value);
                    }
                    state.generalPurpose.R0 = count;
                    break;
                }

                case SYSCALL_EXIT: {
                    handler.exitCode = state.generalPurpose.R1;
                    state.halted = true;
                    break;
                }

                default:
                    throw new Error(`Syscall desconhecida: ${syscallNumber}`);
            }
        },
    };

    return handler;
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add cpu/types.ts cpu/syscall.ts
git commit -m "feat: add SYSCALL opcode and SyscallHandler"
```

---

## Task 8: Wire `SYSCALL` into executor and CPU

**Files:**
- Modify: `cpu/executor.ts:224-235`
- Modify: `cpu/index.ts:1-63`

- [ ] **Step 1: Add `SYSCALL` case to executor**

The executor needs access to the syscall handler. Change the `executeInstruction` signature to accept an optional handler:

In `cpu/executor.ts`, update the function signature:

```typescript
import type { SyscallHandler } from "./syscall";

export const executeInstruction = (
    instruction: Instruction,
    state: CpuState,
    memory: Memory,
    syscallHandler?: SyscallHandler,
) => {
```

Add the `SYSCALL` case before the `default` in the switch:

```typescript
case Opcode.SYSCALL: {
    if (!syscallHandler) {
        throw new Error("SYSCALL executada mas nenhum SyscallHandler foi configurado");
    }
    syscallHandler.handleSyscall(state, memory);
    if (state.halted) return; // sys_exit
    break;
}
```

- [ ] **Step 2: Update `cpu/index.ts` to accept and pass syscall handler**

```typescript
import type { Instruction } from "./types";
import { createCpuState, type CpuState } from "./registers";
import { executeInstruction } from "./executor";
import type { createMemory } from "../memory";
import type { SyscallHandler } from "./syscall";

type Memory = ReturnType<typeof createMemory>;

export interface CpuOptions {
    syscallHandler?: SyscallHandler;
}

export const createCpu = (memory: Memory, options?: CpuOptions) => {
    const state: CpuState = createCpuState();
    const syscallHandler = options?.syscallHandler;

    const run = (program: Instruction[]) => {
        state.programCounter = 0;
        state.halted = false;

        while (!state.halted) {
            if (state.programCounter < 0 || state.programCounter >= program.length) {
                throw new Error(
                    `PC=${state.programCounter} fora dos limites do programa (0..${program.length - 1}). ` +
                    `Esqueceu um HALT?`
                );
            }

            const currentInstruction = program[state.programCounter];
            executeInstruction(currentInstruction, state, memory, syscallHandler);
        }
    };

    const step = (program: Instruction[]) => {
        if (state.halted) return false;

        if (state.programCounter < 0 || state.programCounter >= program.length) {
            throw new Error(
                `PC=${state.programCounter} fora dos limites do programa (0..${program.length - 1}).`
            );
        }

        const currentInstruction = program[state.programCounter];
        executeInstruction(currentInstruction, state, memory, syscallHandler);
        return !state.halted;
    };

    const getState = (): CpuState => ({
        ...state,
        generalPurpose: { ...state.generalPurpose },
    });

    const reset = () => {
        state.programCounter = 0;
        state.zeroFlag = false;
        state.negativeFlag = false;
        state.halted = false;
        state.generalPurpose.R0 = 0;
        state.generalPurpose.R1 = 0;
        state.generalPurpose.R2 = 0;
        state.generalPurpose.R3 = 0;
    };

    return { run, step, getState, reset };
};

export { Opcode, reg, imm, memAddr, memReg, fp, sp, hp } from "./types";
export type { Instruction, Operand, GeneralRegister, SpecialRegister } from "./types";
export type { CpuState } from "./registers";
export { createSyscallHandler } from "./syscall";
export type { SyscallHandler } from "./syscall";
```

- [ ] **Step 3: Update root `index.ts` to re-export syscall types**

Add to `index.ts`:

```typescript
export { createSyscallHandler } from "./cpu";
export type { SyscallHandler, CpuOptions } from "./cpu";
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 5: Commit**

```bash
git add cpu/executor.ts cpu/index.ts index.ts
git commit -m "feat: wire SYSCALL into executor and CPU"
```

---

## Task 9: Codegen — syscall built-ins (`sys_read`, `sys_write`, `sys_exit`)

**Files:**
- Modify: `compiler/codegen.ts` — `compileExpression` (`functionCall` case)

- [ ] **Step 1: Intercept syscall built-in names in `functionCall` case**

In the `functionCall` case of `compileExpression`, add syscall detection before the existing function lookup:

```typescript
case "functionCall": {
    const SYSCALL_BUILTINS: Record<string, number> = {
        sys_read: 0,
        sys_write: 1,
        sys_exit: 2,
    };

    const syscallNum = SYSCALL_BUILTINS[expr.callee];
    if (syscallNum !== undefined) {
        // Syscall built-in: emit inline MOV to registers + SYSCALL
        // sys_read(buf, count): R1 = buf addr, R2 = count
        // sys_write(buf, count): R1 = buf addr, R2 = count
        // sys_exit(code): R1 = exit code
        if (expr.arguments.length >= 1) {
            compileExpression(expr.arguments[0], instructions, fnCtx, ctx);
            emit(instructions, Opcode.MOV, [reg("R1"), reg("R0")]);
        }
        if (expr.arguments.length >= 2) {
            compileExpression(expr.arguments[1], instructions, fnCtx, ctx);
            emit(instructions, Opcode.MOV, [reg("R2"), reg("R0")]);
        }
        emit(instructions, Opcode.MOV, [reg("R0"), imm(syscallNum)]);
        emit(instructions, Opcode.SYSCALL, []);
        // Result in R0
        break;
    }

    // ... existing function call code ...
```

- [ ] **Step 2: Add `Opcode.SYSCALL` import if not already available**

The `codegen.ts` imports from `"../cpu"` which should now export `SYSCALL`. Verify the import includes `Opcode` — it already does: `import { Opcode, reg, fp, imm, memReg, type Instruction } from "../cpu";`

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add compiler/codegen.ts
git commit -m "feat: codegen for syscall built-ins (sys_read, sys_write, sys_exit)"
```

---

## Task 10: End-to-end verification

**Files:**
- Create: `examples/syscall.example`

- [ ] **Step 1: Create a test program using arrays + syscalls**

Create `examples/syscall.example`:

```
fn main(): number {
    buf: char[5]
    n: number = sys_read(buf, 5)
    sys_write(buf, n)
    sys_exit(0)
    return 0
}
```

- [ ] **Step 2: Write a runner script to test**

Create `examples/run-syscall.ts`:

```typescript
import { createMemory } from "../memory";
import { createCpu } from "../cpu";
import { createSyscallHandler } from "../cpu/syscall";
import { compile } from "../compiler";
import * as fs from "fs";

const source = fs.readFileSync("examples/syscall.example", "utf-8");
const instructions = compile(source);

const memory = createMemory();
const handler = createSyscallHandler();
handler.inputBuffer = [72, 101, 108, 108, 111]; // H, e, l, l, o

const cpu = createCpu(memory, { syscallHandler: handler });
cpu.run(instructions);

console.log("Output buffer:", handler.outputBuffer);
console.log("Exit code:", handler.exitCode);
console.log("Expected: [72, 101, 108, 108, 111], exit code: 0");
```

- [ ] **Step 3: Build and run**

Run: `npm run build && node dist/examples/run-syscall.js`
Expected output:
```
Output buffer: [72, 101, 108, 108, 111]
Exit code: 0
```

- [ ] **Step 4: Also test the basic array example**

Create `examples/run-array.ts`:

```typescript
import { createMemory } from "../memory";
import { createCpu } from "../cpu";
import { compile } from "../compiler";
import * as fs from "fs";

const source = fs.readFileSync("examples/array.example", "utf-8");
const instructions = compile(source);

const memory = createMemory();
const cpu = createCpu(memory);
cpu.run(instructions);

const state = cpu.getState();
console.log("R0:", state.generalPurpose.R0);
console.log("Expected: 60");
```

Run: `npm run build && node dist/examples/run-array.js`
Expected: `R0: 60`

- [ ] **Step 5: Fix any issues found**

Debug and fix any problems discovered during e2e testing.

- [ ] **Step 6: Commit**

```bash
git add examples/
git commit -m "feat: add example programs for arrays and syscalls"
```

---

## Task 11: Update documentation

**Files:**
- Modify: `docs/language.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `docs/language.md`**

Add sections for:
- Arrays in the type system section (after `ref<NomeStruct>`)
- Index access in the expressions section
- `sys_read`, `sys_write`, `sys_exit` in the expressions section
- `SYSCALL` in the calling convention section
- Update "Limitacoes conhecidas" to remove "Sem arrays"
- Add array and syscall examples to the examples section

- [ ] **Step 2: Update `CLAUDE.md`**

Update the architecture description to mention `SYSCALL` (21 opcodes now), arrays, and syscall built-ins. Update the high-level language features list.

- [ ] **Step 3: Commit**

```bash
git add docs/language.md CLAUDE.md
git commit -m "docs: update language reference and CLAUDE.md for arrays and syscalls"
```
