import { Opcode, reg, fp, imm, memReg, type Instruction } from "../cpu";
import { WORD_SIZE_IN_BYTES } from "../memory";
import type {
    Program, Declaration, FunctionDeclaration,
    Statement, Expression,
} from "./ast";

// ============================================================
// Codegen - Gera instrucoes do pseudo-assembly a partir da AST
// ============================================================
//
// Convencao de chamada:
//   - Caller empurra argumentos da direita para a esquerda
//   - CALL salva frame (old FP + return address)
//   - Resultado da funcao fica em R0
//   - Caller limpa os argumentos da stack apos o retorno
//
// Layout do stack frame:
//   @(FP + 4*(N-i))  = parametro i  (N = total de params)
//   @(FP)            = old FP
//   @(FP - 4)        = return address
//   @(FP - 8)        = local 0
//   @(FP - 12)       = local 1
//   ...

// --- Contexto de compilacao ---

interface StructInfo {
    name: string;
    sizeInBytes: number;
    fieldOffsets: Map<string, number>;
}

interface VariableLocation {
    offsetFromFP: number; // positivo = parametro, negativo = local
}

interface FunctionContext {
    name: string;
    params: Map<string, VariableLocation>;
    locals: Map<string, VariableLocation>;
    nextLocalOffset: number; // proximo offset negativo para alocar local
    baseAddress: number; // endereco absoluto da primeira instrucao da funcao
}

interface CompilationContext {
    structs: Map<string, StructInfo>;
    functionAddresses: Map<string, number>;
}

// --- Helpers de emissao ---

const emit = (instructions: Instruction[], opcode: Opcode, operands: Instruction["operands"] = []) => {
    instructions.push({ opcode, operands });
};

// Carrega em R2 o endereco FP + offset
const emitLoadAddressFromFP = (instructions: Instruction[], offset: number) => {
    emit(instructions, Opcode.MOV, [reg("R2"), fp()]);
    if (offset > 0) {
        emit(instructions, Opcode.ADD, [reg("R2"), imm(offset)]);
    } else if (offset < 0) {
        emit(instructions, Opcode.SUB, [reg("R2"), imm(-offset)]);
    }
};

// --- Primeira passada: coletar structs ---

const collectStructs = (declarations: Declaration[]): Map<string, StructInfo> => {
    const structs = new Map<string, StructInfo>();

    for (const decl of declarations) {
        if (decl.kind !== "structDeclaration") continue;
        const fieldOffsets = new Map<string, number>();
        let offset = 0;
        for (const field of decl.fields) {
            fieldOffsets.set(field.name, offset);
            offset += WORD_SIZE_IN_BYTES; // todos os tipos ocupam 1 word
        }
        structs.set(decl.name, {
            name: decl.name,
            sizeInBytes: offset,
            fieldOffsets,
        });
    }

    return structs;
};

// --- Compilacao de expressoes (resultado em R0) ---

const compileExpression = (
    expr: Expression,
    instructions: Instruction[],
    fnCtx: FunctionContext,
    ctx: CompilationContext,
) => {
    switch (expr.kind) {
        case "numberLiteral":
            emit(instructions, Opcode.MOV, [reg("R0"), imm(expr.value)]);
            break;

        case "identifier": {
            const loc = fnCtx.params.get(expr.name) ?? fnCtx.locals.get(expr.name);
            if (!loc) throw new Error(`Variavel '${expr.name}' nao declarada na funcao '${fnCtx.name}'`);
            emitLoadAddressFromFP(instructions, loc.offsetFromFP);
            emit(instructions, Opcode.LOAD, [reg("R0"), memReg("R2")]);
            break;
        }

        case "binaryExpression": {
            // compila lado esquerdo → R0, salva na stack
            compileExpression(expr.left, instructions, fnCtx, ctx);
            emit(instructions, Opcode.PUSH, [reg("R0")]);
            // compila lado direito → R0
            compileExpression(expr.right, instructions, fnCtx, ctx);
            // R1 = right, R0 = left
            emit(instructions, Opcode.MOV, [reg("R1"), reg("R0")]);
            emit(instructions, Opcode.POP, [reg("R0")]);
            // opera: R0 = R0 op R1
            switch (expr.operator) {
                case "+": emit(instructions, Opcode.ADD, [reg("R0"), reg("R1")]); break;
                case "-": emit(instructions, Opcode.SUB, [reg("R0"), reg("R1")]); break;
                case "*": emit(instructions, Opcode.MUL, [reg("R0"), reg("R1")]); break;
                case "/": emit(instructions, Opcode.DIV, [reg("R0"), reg("R1")]); break;
            }
            break;
        }

        case "functionCall": {
            const targetAddr = ctx.functionAddresses.get(expr.callee);
            if (targetAddr === undefined) {
                throw new Error(`Funcao '${expr.callee}' nao definida`);
            }
            // empurra argumentos da direita para a esquerda
            for (let i = expr.arguments.length - 1; i >= 0; i--) {
                compileExpression(expr.arguments[i], instructions, fnCtx, ctx);
                emit(instructions, Opcode.PUSH, [reg("R0")]);
            }
            // chama a funcao
            emit(instructions, Opcode.CALL, [imm(targetAddr)]);
            // limpa argumentos da stack
            for (let i = 0; i < expr.arguments.length; i++) {
                emit(instructions, Opcode.POP, [reg("R3")]); // R3 = descarte
            }
            // resultado ja esta em R0
            break;
        }

        case "fieldAccess": {
            // compila o objeto (ref/ponteiro) → R0 (endereco no heap)
            compileExpression(expr.object, instructions, fnCtx, ctx);
            // descobre o offset do campo
            const structInfo = resolveStructFromExpression(expr.object, fnCtx, ctx);
            const fieldOffset = structInfo.fieldOffsets.get(expr.field);
            if (fieldOffset === undefined) {
                throw new Error(`Campo '${expr.field}' nao existe em '${structInfo.name}'`);
            }
            // R0 = endereco base, soma offset
            if (fieldOffset > 0) {
                emit(instructions, Opcode.ADD, [reg("R0"), imm(fieldOffset)]);
            }
            // R0 = endereco do campo, carrega o valor
            emit(instructions, Opcode.MOV, [reg("R2"), reg("R0")]);
            emit(instructions, Opcode.LOAD, [reg("R0"), memReg("R2")]);
            break;
        }

        case "allocExpression": {
            const structInfo = ctx.structs.get(expr.typeName);
            if (!structInfo) throw new Error(`Struct '${expr.typeName}' nao definida`);
            emit(instructions, Opcode.ALLOC, [reg("R0"), imm(structInfo.sizeInBytes)]);
            break;
        }

        case "comparisonExpression": {
            // Para > e <=, inverte operandos e usa < e >=
            let leftExpr = expr.left;
            let rightExpr = expr.right;
            let effectiveOp = expr.operator;

            if (effectiveOp === ">") {
                leftExpr = expr.right;
                rightExpr = expr.left;
                effectiveOp = "<";
            } else if (effectiveOp === "<=") {
                leftExpr = expr.right;
                rightExpr = expr.left;
                effectiveOp = ">=";
            }

            compileExpression(leftExpr, instructions, fnCtx, ctx);
            emit(instructions, Opcode.PUSH, [reg("R0")]);
            compileExpression(rightExpr, instructions, fnCtx, ctx);
            emit(instructions, Opcode.MOV, [reg("R1"), reg("R0")]);
            emit(instructions, Opcode.POP, [reg("R0")]);
            emit(instructions, Opcode.CMP, [reg("R0"), reg("R1")]);
            emit(instructions, Opcode.MOV, [reg("R0"), imm(0)]);

            // Jump OVER "MOV R0, 1" quando condição NÃO atendida
            const skipTrueAddr = fnCtx.baseAddress + instructions.length + 2;
            switch (effectiveOp) {
                case "==": emit(instructions, Opcode.JNZ, [imm(skipTrueAddr)]); break;
                case "!=": emit(instructions, Opcode.JZ,  [imm(skipTrueAddr)]); break;
                case "<":  emit(instructions, Opcode.JGE, [imm(skipTrueAddr)]); break;
                case ">=": emit(instructions, Opcode.JLT, [imm(skipTrueAddr)]); break;
            }

            emit(instructions, Opcode.MOV, [reg("R0"), imm(1)]);
            break;
        }

        case "logicalExpression": {
            compileExpression(expr.left, instructions, fnCtx, ctx);
            emit(instructions, Opcode.CMP, [reg("R0"), imm(0)]);

            // short-circuit: && salta se false (JZ), || salta se true (JNZ)
            const jumpOpcode = expr.operator === "&&" ? Opcode.JZ : Opcode.JNZ;
            const jumpIdx = instructions.length;
            emit(instructions, jumpOpcode, [imm(0)]); // placeholder

            compileExpression(expr.right, instructions, fnCtx, ctx);

            // patch: pula para depois do lado direito
            const endAddr = fnCtx.baseAddress + instructions.length;
            instructions[jumpIdx] = { opcode: jumpOpcode, operands: [imm(endAddr)] };
            break;
        }

        case "unaryExpression": {
            // !operand: se 0 → 1, senão → 0
            compileExpression(expr.operand, instructions, fnCtx, ctx);
            emit(instructions, Opcode.CMP, [reg("R0"), imm(0)]);
            emit(instructions, Opcode.MOV, [reg("R0"), imm(0)]);
            const skipAddr = fnCtx.baseAddress + instructions.length + 2;
            emit(instructions, Opcode.JNZ, [imm(skipAddr)]);
            emit(instructions, Opcode.MOV, [reg("R0"), imm(1)]);
            break;
        }
    }
};

// --- Resolve qual struct uma expressao referencia ---

const resolveStructFromExpression = (
    expr: Expression,
    fnCtx: FunctionContext,
    ctx: CompilationContext,
): StructInfo => {
    if (expr.kind === "identifier") {
        // procura o tipo da variavel nos parametros e locais
        // para encontrar o nome do struct
        const paramEntry = findParamType(expr.name, fnCtx);
        if (paramEntry && paramEntry.kind === "ref" && paramEntry.innerTypeName) {
            const info = ctx.structs.get(paramEntry.innerTypeName);
            if (info) return info;
        }
        const localEntry = findLocalType(expr.name, fnCtx);
        if (localEntry && localEntry.kind === "ref" && localEntry.innerTypeName) {
            const info = ctx.structs.get(localEntry.innerTypeName);
            if (info) return info;
        }
    }
    throw new Error(`Nao foi possivel resolver o tipo struct da expressao para acesso a campo`);
};

// Essas funcoes serao preenchidas pelo contexto durante a compilacao da funcao
// Precisamos guardar os tipos tambem, nao so os offsets
// Vou estender o FunctionContext

interface TypedFunctionContext extends FunctionContext {
    paramTypes: Map<string, { kind: string; innerTypeName?: string }>;
    localTypes: Map<string, { kind: string; innerTypeName?: string }>;
}

const findParamType = (name: string, fnCtx: FunctionContext) => {
    return (fnCtx as TypedFunctionContext).paramTypes?.get(name);
};

const findLocalType = (name: string, fnCtx: FunctionContext) => {
    return (fnCtx as TypedFunctionContext).localTypes?.get(name);
};

// --- Compilacao de statements ---

const compileStatement = (
    stmt: Statement,
    instructions: Instruction[],
    fnCtx: TypedFunctionContext,
    ctx: CompilationContext,
) => {
    switch (stmt.kind) {
        case "variableDeclaration": {
            // compila o inicializador → R0
            compileExpression(stmt.initializer, instructions, fnCtx, ctx);
            // empurra na stack como variavel local
            emit(instructions, Opcode.PUSH, [reg("R0")]);
            // registra a localizacao
            const offset = fnCtx.nextLocalOffset;
            fnCtx.nextLocalOffset -= WORD_SIZE_IN_BYTES;
            fnCtx.locals.set(stmt.name, { offsetFromFP: offset });
            // registra o tipo
            if (stmt.type.kind === "ref") {
                fnCtx.localTypes.set(stmt.name, { kind: "ref", innerTypeName: stmt.type.innerTypeName });
            } else {
                fnCtx.localTypes.set(stmt.name, { kind: "primitive" });
            }
            break;
        }

        case "assignment": {
            if (stmt.target.kind === "fieldAccess") {
                // ptr.field = expr
                // compila o valor → R0, salva
                compileExpression(stmt.value, instructions, fnCtx, ctx);
                emit(instructions, Opcode.PUSH, [reg("R0")]);
                // compila o objeto (ponteiro) → R0
                compileExpression(stmt.target.object, instructions, fnCtx, ctx);
                // resolve offset do campo
                const structInfo = resolveStructFromExpression(stmt.target.object, fnCtx, ctx);
                const fieldOffset = structInfo.fieldOffsets.get(stmt.target.field);
                if (fieldOffset === undefined) {
                    throw new Error(`Campo '${stmt.target.field}' nao existe em '${structInfo.name}'`);
                }
                if (fieldOffset > 0) {
                    emit(instructions, Opcode.ADD, [reg("R0"), imm(fieldOffset)]);
                }
                // R0 = endereco do campo, R2 = endereco, restaura valor
                emit(instructions, Opcode.MOV, [reg("R2"), reg("R0")]);
                emit(instructions, Opcode.POP, [reg("R0")]);
                emit(instructions, Opcode.STORE, [memReg("R2"), reg("R0")]);
            } else if (stmt.target.kind === "identifier") {
                // ident = expr
                compileExpression(stmt.value, instructions, fnCtx, ctx);
                const loc = fnCtx.params.get(stmt.target.name) ?? fnCtx.locals.get(stmt.target.name);
                if (!loc) throw new Error(`Variavel '${stmt.target.name}' nao declarada`);
                emitLoadAddressFromFP(instructions, loc.offsetFromFP);
                emit(instructions, Opcode.STORE, [memReg("R2"), reg("R0")]);
            } else {
                throw new Error("Alvo de atribuicao invalido");
            }
            break;
        }

        case "returnStatement": {
            compileExpression(stmt.value, instructions, fnCtx, ctx);
            // limpa variaveis locais da stack (SP volta para inicio do frame)
            emit(instructions, Opcode.RET, []);
            break;
        }

        case "freeStatement": {
            compileExpression(stmt.value, instructions, fnCtx, ctx);
            emit(instructions, Opcode.FREE, [reg("R0")]);
            break;
        }

        case "expressionStatement": {
            compileExpression(stmt.expression, instructions, fnCtx, ctx);
            break;
        }

        case "ifStatement": {
            compileExpression(stmt.condition, instructions, fnCtx, ctx);
            emit(instructions, Opcode.CMP, [reg("R0"), imm(0)]);

            if (stmt.alternate === null) {
                // sem else: JZ end, consequent, end:
                const jzIdx = instructions.length;
                emit(instructions, Opcode.JZ, [imm(0)]); // placeholder
                for (const s of stmt.consequent) {
                    compileStatement(s, instructions, fnCtx, ctx);
                }
                instructions[jzIdx] = { opcode: Opcode.JZ, operands: [imm(fnCtx.baseAddress + instructions.length)] };
            } else {
                // com else: JZ else, consequent, JMP end, else:, alternate, end:
                const jzIdx = instructions.length;
                emit(instructions, Opcode.JZ, [imm(0)]); // placeholder → else
                for (const s of stmt.consequent) {
                    compileStatement(s, instructions, fnCtx, ctx);
                }
                const jmpIdx = instructions.length;
                emit(instructions, Opcode.JMP, [imm(0)]); // placeholder → end
                instructions[jzIdx] = { opcode: Opcode.JZ, operands: [imm(fnCtx.baseAddress + instructions.length)] };
                for (const s of stmt.alternate) {
                    compileStatement(s, instructions, fnCtx, ctx);
                }
                instructions[jmpIdx] = { opcode: Opcode.JMP, operands: [imm(fnCtx.baseAddress + instructions.length)] };
            }
            break;
        }

        case "whileStatement": {
            const loopAddr = fnCtx.baseAddress + instructions.length;
            compileExpression(stmt.condition, instructions, fnCtx, ctx);
            emit(instructions, Opcode.CMP, [reg("R0"), imm(0)]);
            const jzIdx = instructions.length;
            emit(instructions, Opcode.JZ, [imm(0)]); // placeholder → exit
            for (const s of stmt.body) {
                compileStatement(s, instructions, fnCtx, ctx);
            }
            emit(instructions, Opcode.JMP, [imm(loopAddr)]);
            instructions[jzIdx] = { opcode: Opcode.JZ, operands: [imm(fnCtx.baseAddress + instructions.length)] };
            break;
        }
    }
};

// --- Compilacao de funcao ---

const compileFunction = (
    decl: FunctionDeclaration,
    ctx: CompilationContext,
    baseAddress: number,
): Instruction[] => {
    const instructions: Instruction[] = [];

    const fnCtx: TypedFunctionContext = {
        name: decl.name,
        params: new Map(),
        locals: new Map(),
        nextLocalOffset: -(2 * WORD_SIZE_IN_BYTES), // FP-8 = primeiro local (FP-4 = ret addr)
        baseAddress,
        paramTypes: new Map(),
        localTypes: new Map(),
    };

    // mapeia parametros: arg[i] esta em FP + 4 + i*4
    for (let i = 0; i < decl.parameters.length; i++) {
        const param = decl.parameters[i];
        const offset = WORD_SIZE_IN_BYTES + i * WORD_SIZE_IN_BYTES; // +4, +8, +12...
        fnCtx.params.set(param.name, { offsetFromFP: offset });
        if (param.type.kind === "ref") {
            fnCtx.paramTypes.set(param.name, { kind: "ref", innerTypeName: param.type.innerTypeName });
        } else {
            fnCtx.paramTypes.set(param.name, { kind: "primitive" });
        }
    }

    // compila cada statement
    for (const stmt of decl.body) {
        compileStatement(stmt, instructions, fnCtx, ctx);
    }

    // garante que a funcao termina (caso nao tenha return explicito)
    const lastOpcode = instructions.length > 0 ? instructions[instructions.length - 1].opcode : null;
    if (lastOpcode !== Opcode.RET) {
        emit(instructions, Opcode.RET, []);
    }

    return instructions;
};

// --- Compilacao do programa completo ---

export const generateCode = (program: Program): Instruction[] => {
    const structs = collectStructs(program.declarations);

    const functions = program.declarations.filter(
        (d): d is FunctionDeclaration => d.kind === "functionDeclaration"
    );

    // Primeira passada: calcular enderecos das funcoes
    // instrucao 0 = JMP para main
    const ctx: CompilationContext = { structs, functionAddresses: new Map() };

    // compila cada funcao para saber seu tamanho
    const compiledFunctions: { name: string; instructions: Instruction[] }[] = [];

    // precisamos de duas passadas porque funcoes podem se chamar mutuamente
    // passada 1: estima enderecos (compila com enderecos placeholder)
    // passada 2: recompila com enderecos corretos

    // Para simplificar: compilamos uma vez, calculamos enderecos, e patcheamos os CALLs

    // compilacao inicial com enderecos 0 (placeholder)
    for (const fn of functions) {
        ctx.functionAddresses.set(fn.name, 0);
    }
    for (const fn of functions) {
        compiledFunctions.push({ name: fn.name, instructions: compileFunction(fn, ctx, 0) });
    }

    // calcula enderecos reais (instrucoes 0-1 = CALL main + HALT, funcoes vem depois)
    let address = 2; // pula CALL + HALT
    for (const compiled of compiledFunctions) {
        ctx.functionAddresses.set(compiled.name, address);
        address += compiled.instructions.length;
    }

    // recompila com enderecos corretos
    compiledFunctions.length = 0;
    for (const fn of functions) {
        const addr = ctx.functionAddresses.get(fn.name)!;
        compiledFunctions.push({ name: fn.name, instructions: compileFunction(fn, ctx, addr) });
    }

    // monta o programa final
    const mainAddr = ctx.functionAddresses.get("main");
    if (mainAddr === undefined) {
        throw new Error("Funcao 'main' nao encontrada");
    }

    const finalProgram: Instruction[] = [];

    // instrucao 0: CALL main (cria stack frame para main)
    // instrucao 1: HALT (executa quando main retorna)
    emit(finalProgram, Opcode.CALL, [imm(mainAddr)]);
    emit(finalProgram, Opcode.HALT, []);

    // todas as funcoes
    for (const compiled of compiledFunctions) {
        for (const instr of compiled.instructions) {
            finalProgram.push(instr);
        }
    }

    return finalProgram;
};