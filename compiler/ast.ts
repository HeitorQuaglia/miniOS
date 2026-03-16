// ============================================================
// AST - Arvore Sintatica Abstrata
// ============================================================

// --- Tipos da linguagem ---

export type TypeNode =
    | { kind: "primitive"; name: "number" | "char" }
    | { kind: "ref"; innerTypeName: string };

// --- Declaracoes top-level ---

export interface StructField {
    name: string;
    type: TypeNode;
}

export interface StructDeclaration {
    kind: "structDeclaration";
    name: string;
    fields: StructField[];
}

export interface FunctionParameter {
    name: string;
    type: TypeNode;
}

export interface FunctionDeclaration {
    kind: "functionDeclaration";
    name: string;
    parameters: FunctionParameter[];
    returnType: TypeNode | null;
    body: Statement[];
}

export type Declaration = StructDeclaration | FunctionDeclaration;

// --- Statements ---

export interface VariableDeclaration {
    kind: "variableDeclaration";
    name: string;
    type: TypeNode;
    initializer: Expression;
}

export interface Assignment {
    kind: "assignment";
    target: Expression; // Identifier ou FieldAccess
    value: Expression;
}

export interface ReturnStatement {
    kind: "returnStatement";
    value: Expression;
}

export interface FreeStatement {
    kind: "freeStatement";
    value: Expression;
}

export interface ExpressionStatement {
    kind: "expressionStatement";
    expression: Expression;
}

export type Statement =
    | VariableDeclaration
    | Assignment
    | ReturnStatement
    | FreeStatement
    | ExpressionStatement;

// --- Expressoes ---

export interface NumberLiteral {
    kind: "numberLiteral";
    value: number;
}

export interface Identifier {
    kind: "identifier";
    name: string;
}

export interface BinaryExpression {
    kind: "binaryExpression";
    operator: "+" | "-" | "*" | "/";
    left: Expression;
    right: Expression;
}

export interface FunctionCall {
    kind: "functionCall";
    callee: string;
    arguments: Expression[];
}

export interface FieldAccess {
    kind: "fieldAccess";
    object: Expression;
    field: string;
}

export interface AllocExpression {
    kind: "allocExpression";
    typeName: string;
}

export type Expression =
    | NumberLiteral
    | Identifier
    | BinaryExpression
    | FunctionCall
    | FieldAccess
    | AllocExpression;

// --- Programa completo ---

export interface Program {
    declarations: Declaration[];
}