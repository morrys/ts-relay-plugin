import ts from 'typescript';
export type ImportNode = {
    path: string;
    definitionName: string;
};

export type ImportReturn = ts.VariableStatement | ts.ImportDeclaration;

function update(
    context: ts.TransformationContext,
    node: ts.SourceFile,
    statements: ts.Statement[],
) {
    const { factory } = context;
    if (!factory) {
        return updateWithoutContext(context, node, statements);
    }
    return context.factory.updateSourceFile(node, statements);
}

function createDefinitionIdentifier(
    context: ts.TransformationContext,
    imp: ImportNode,
): ts.Identifier {
    const { factory } = context;
    if (!factory) {
        return ts.createIdentifier(imp.definitionName);
    }
    return context.factory.createIdentifier(imp.definitionName);
}

function createImport(
    context: ts.TransformationContext,
    imp: ImportNode,
    identifier: ts.Identifier,
): ImportReturn {
    const { factory } = context;
    if (!factory) {
        return createImportWithoutContext(context, imp, identifier);
    }
    const { module } = context.getCompilerOptions();
    if (module === ts.ModuleKind.CommonJS) {
        return factory.createVariableStatement(
            /*modifiers*/ undefined,
            factory.createVariableDeclarationList([
                factory.createVariableDeclaration(
                    identifier,
                    /*type*/ undefined,
                    undefined,
                    factory.createPropertyAccessExpression(
                        factory.createCallExpression(
                            factory.createIdentifier('require'),
                            [],
                            [factory.createStringLiteral(imp.path)],
                        ),
                        factory.createIdentifier('default'),
                    ),
                ),
            ]),
        );
    }
    return factory.createImportDeclaration(
        undefined,
        undefined,
        factory.createImportClause(false, identifier, undefined),
        factory.createStringLiteral(imp.path),
    );
}

function createImportWithoutContext(
    context: ts.TransformationContext,
    imp: ImportNode,
    identifier: ts.Identifier,
): ImportReturn {
    const { module } = context.getCompilerOptions();
    if (module === ts.ModuleKind.CommonJS) {
        return ts.createVariableStatement(
            /*modifiers*/ undefined,
            ts.createVariableDeclarationList([
                ts.createVariableDeclaration(
                    identifier,
                    /*type*/ undefined,
                    ts.createPropertyAccess(
                        ts.createCall(
                            ts.createIdentifier('require'),
                            [],
                            [ts.createLiteral(imp.path)],
                        ),
                        ts.createIdentifier('default'),
                    ),
                ),
            ]),
        );
    }
    return ts.createImportDeclaration(
        undefined,
        undefined,
        ts.createImportClause(identifier, undefined),
        ts.createStringLiteral(imp.path),
    );
}

function updateWithoutContext(
    context: ts.TransformationContext,
    node: ts.SourceFile,
    statements: ts.Statement[],
) {
    return ts.updateSourceFileNode(node, statements);
}

export const resolve = {
    update,
    createDefinitionIdentifier,
    createImport,
};
