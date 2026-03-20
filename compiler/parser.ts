import { TokenType, type Token } from "./tokens";
import type {
    Program, Declaration, StructDeclaration, FunctionDeclaration,
    StructField, FunctionParameter, TypeNode,
    Statement, Expression, IfStatement, WhileStatement,
    ComparisonOperator,
} from "./ast";

export const parse = (tokens: Token[]): Program => {
    let pos = 0;

    // --- Helpers ---

    const current = (): Token => tokens[pos];
    const peek = (offset = 0): Token => tokens[pos + offset] ?? tokens[tokens.length - 1];

    const expect = (type: TokenType, context: string): Token => {
        const tok = current();
        if (tok.type !== type) {
            throw new Error(
                `${context}: esperava '${type}', encontrou '${tok.type}' (${tok.value}) ` +
                `na linha ${tok.line}:${tok.column}`
            );
        }
        pos++;
        return tok;
    };

    const match = (type: TokenType): boolean => {
        if (current().type === type) { pos++; return true; }
        return false;
    };

    // --- Tipos ---

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

    // --- Declaracoes top-level ---

    const parseStructDeclaration = (): StructDeclaration => {
        expect(TokenType.STRUCT, "struct");
        const name = expect(TokenType.IDENTIFIER, "struct name").value;
        expect(TokenType.LBRACE, "struct body");

        const fields: StructField[] = [];
        while (current().type !== TokenType.RBRACE) {
            const fieldName = expect(TokenType.IDENTIFIER, "field name").value;
            expect(TokenType.COLON, "field type");
            const fieldType = parseType();
            fields.push({ name: fieldName, type: fieldType });
        }
        expect(TokenType.RBRACE, "struct body");

        return { kind: "structDeclaration", name, fields };
    };

    const parseFunctionDeclaration = (): FunctionDeclaration => {
        expect(TokenType.FN, "fn");
        const name = expect(TokenType.IDENTIFIER, "function name").value;
        expect(TokenType.LPAREN, "function params");

        const parameters: FunctionParameter[] = [];
        if (current().type !== TokenType.RPAREN) {
            do {
                const paramName = expect(TokenType.IDENTIFIER, "param name").value;
                expect(TokenType.COLON, "param type");
                const paramType = parseType();
                parameters.push({ name: paramName, type: paramType });
            } while (match(TokenType.COMMA));
        }
        expect(TokenType.RPAREN, "function params");

        let returnType: TypeNode | null = null;
        if (match(TokenType.COLON)) {
            returnType = parseType();
        }

        expect(TokenType.LBRACE, "function body");
        const body: Statement[] = [];
        while (current().type !== TokenType.RBRACE) {
            body.push(parseStatement());
        }
        expect(TokenType.RBRACE, "function body");

        return { kind: "functionDeclaration", name, parameters, returnType, body };
    };

    // --- Statements ---

    const parseIfStatement = (): IfStatement => {
        expect(TokenType.IF, "if");
        expect(TokenType.LPAREN, "if condition");
        const condition = parseExpression();
        expect(TokenType.RPAREN, "if condition");
        expect(TokenType.LBRACE, "if body");
        const consequent: Statement[] = [];
        while (current().type !== TokenType.RBRACE) {
            consequent.push(parseStatement());
        }
        expect(TokenType.RBRACE, "if body");

        let alternate: Statement[] | null = null;
        if (match(TokenType.ELSE)) {
            if (current().type === TokenType.IF) {
                alternate = [parseIfStatement()];
            } else {
                expect(TokenType.LBRACE, "else body");
                const elseBody: Statement[] = [];
                while (current().type !== TokenType.RBRACE) {
                    elseBody.push(parseStatement());
                }
                expect(TokenType.RBRACE, "else body");
                alternate = elseBody;
            }
        }

        return { kind: "ifStatement", condition, consequent, alternate };
    };

    const parseWhileStatement = (): WhileStatement => {
        expect(TokenType.WHILE, "while");
        expect(TokenType.LPAREN, "while condition");
        const condition = parseExpression();
        expect(TokenType.RPAREN, "while condition");
        expect(TokenType.LBRACE, "while body");
        const body: Statement[] = [];
        while (current().type !== TokenType.RBRACE) {
            body.push(parseStatement());
        }
        expect(TokenType.RBRACE, "while body");

        return { kind: "whileStatement", condition, body };
    };

    const parseStatement = (): Statement => {
        // if (...)  { ... }
        if (current().type === TokenType.IF) {
            return parseIfStatement();
        }

        // while (...) { ... }
        if (current().type === TokenType.WHILE) {
            return parseWhileStatement();
        }

        // return ...
        if (current().type === TokenType.RETURN) {
            pos++;
            const value = parseExpression();
            return { kind: "returnStatement", value };
        }

        // free(...)
        if (current().type === TokenType.FREE) {
            pos++;
            expect(TokenType.LPAREN, "free");
            const value = parseExpression();
            expect(TokenType.RPAREN, "free");
            return { kind: "freeStatement", value };
        }

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

        // assignment: target = expr  (target pode ser ident ou ident.field)
        // ou expression statement
        const expr = parseExpression();

        if (match(TokenType.EQUALS)) {
            const value = parseExpression();
            return { kind: "assignment", target: expr, value };
        }

        return { kind: "expressionStatement", expression: expr };
    };

    // --- Expressoes ---

    const parseExpression = (): Expression => parseLogicalOr();

    const parseLogicalOr = (): Expression => {
        let left = parseLogicalAnd();
        while (current().type === TokenType.OR) {
            pos++;
            const right = parseLogicalAnd();
            left = { kind: "logicalExpression", operator: "||", left, right };
        }
        return left;
    };

    const parseLogicalAnd = (): Expression => {
        let left = parseComparison();
        while (current().type === TokenType.AND) {
            pos++;
            const right = parseComparison();
            left = { kind: "logicalExpression", operator: "&&", left, right };
        }
        return left;
    };

    const parseComparison = (): Expression => {
        let left = parseAdditive();

        const t = current().type;
        if (
            t === TokenType.EQ_EQ  || t === TokenType.NOT_EQ ||
            t === TokenType.LANGLE || t === TokenType.RANGLE ||
            t === TokenType.LT_EQ  || t === TokenType.GT_EQ
        ) {
            const opToken = current();
            pos++;
            const right = parseAdditive();

            let operator: ComparisonOperator;
            switch (opToken.type) {
                case TokenType.EQ_EQ:  operator = "=="; break;
                case TokenType.NOT_EQ: operator = "!="; break;
                case TokenType.LANGLE: operator = "<";  break;
                case TokenType.RANGLE: operator = ">";  break;
                case TokenType.LT_EQ:  operator = "<="; break;
                case TokenType.GT_EQ:  operator = ">="; break;
                default: throw new Error("Unreachable");
            }

            left = { kind: "comparisonExpression", operator, left, right };
        }
        return left;
    };

    const parseAdditive = (): Expression => {
        let left = parseMultiplicative();
        while (current().type === TokenType.PLUS || current().type === TokenType.MINUS) {
            const op = (pos++, tokens[pos - 1].value) as "+" | "-";
            const right = parseMultiplicative();
            left = { kind: "binaryExpression", operator: op, left, right };
        }
        return left;
    };

    const parseMultiplicative = (): Expression => {
        let left = parseUnary();
        while (current().type === TokenType.STAR || current().type === TokenType.SLASH) {
            const op = (pos++, tokens[pos - 1].value) as "*" | "/";
            const right = parseUnary();
            left = { kind: "binaryExpression", operator: op, left, right };
        }
        return left;
    };

    const parseUnary = (): Expression => {
        if (current().type === TokenType.BANG) {
            pos++;
            const operand = parseUnary();
            return { kind: "unaryExpression", operator: "!", operand };
        }
        return parsePostfix();
    };

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

    const parsePrimary = (): Expression => {
        // number literal
        if (current().type === TokenType.NUMBER_LITERAL) {
            const value = parseInt(current().value, 10);
            pos++;
            return { kind: "numberLiteral", value };
        }

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

        // parenthesized expression
        if (current().type === TokenType.LPAREN) {
            pos++;
            const expr = parseExpression();
            expect(TokenType.RPAREN, "parenthesized expression");
            return expr;
        }

        // identifier ou function call
        if (current().type === TokenType.IDENTIFIER) {
            const name = current().value;
            pos++;

            // function call: name(args...)
            if (current().type === TokenType.LPAREN) {
                pos++;
                const args: Expression[] = [];
                if (current().type !== TokenType.RPAREN) {
                    do {
                        args.push(parseExpression());
                    } while (match(TokenType.COMMA));
                }
                expect(TokenType.RPAREN, "function call");
                return { kind: "functionCall", callee: name, arguments: args };
            }

            return { kind: "identifier", name };
        }

        throw new Error(
            `Expressao inesperada '${current().value}' na linha ${current().line}:${current().column}`
        );
    };

    // --- Programa ---

    const declarations: Declaration[] = [];
    while (current().type !== TokenType.EOF) {
        if (current().type === TokenType.STRUCT) {
            declarations.push(parseStructDeclaration());
        } else if (current().type === TokenType.FN) {
            declarations.push(parseFunctionDeclaration());
        } else {
            throw new Error(
                `Declaracao inesperada '${current().value}' na linha ${current().line}:${current().column}. ` +
                `Esperava 'struct' ou 'fn'.`
            );
        }
    }

    return { declarations };
};
