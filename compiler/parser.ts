import { TokenType, type Token } from "./tokens";
import type {
    Program, Declaration, StructDeclaration, FunctionDeclaration,
    StructField, FunctionParameter, TypeNode,
    Statement, Expression,
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
        if (match(TokenType.NUMBER_TYPE)) return { kind: "primitive", name: "number" };
        if (match(TokenType.CHAR_TYPE))   return { kind: "primitive", name: "char" };
        if (match(TokenType.REF)) {
            expect(TokenType.LANGLE, "ref type");
            const name = expect(TokenType.IDENTIFIER, "ref type").value;
            expect(TokenType.RANGLE, "ref type");
            return { kind: "ref", innerTypeName: name };
        }
        throw new Error(
            `Tipo inesperado '${current().value}' na linha ${current().line}:${current().column}`
        );
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

    const parseStatement = (): Statement => {
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

        // variableDeclaration:  ident : type = expr
        if (current().type === TokenType.IDENTIFIER && peek(1).type === TokenType.COLON) {
            const name = expect(TokenType.IDENTIFIER, "var name").value;
            expect(TokenType.COLON, "var type");
            const type = parseType();
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

    const parseExpression = (): Expression => parseAdditive();

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
        let left = parsePostfix();
        while (current().type === TokenType.STAR || current().type === TokenType.SLASH) {
            const op = (pos++, tokens[pos - 1].value) as "*" | "/";
            const right = parsePostfix();
            left = { kind: "binaryExpression", operator: op, left, right };
        }
        return left;
    };

    const parsePostfix = (): Expression => {
        let expr = parsePrimary();
        // field access: expr.field
        while (current().type === TokenType.DOT) {
            pos++;
            const field = expect(TokenType.IDENTIFIER, "field access").value;
            expr = { kind: "fieldAccess", object: expr, field };
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

        // alloc(TypeName)
        if (current().type === TokenType.ALLOC) {
            pos++;
            expect(TokenType.LPAREN, "alloc");
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
