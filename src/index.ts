/* eslint-disable import/no-default-export */
/* eslint-disable import/no-extraneous-dependencies */
import { dirname, join as joinPath, relative as relativePath, resolve as resolvePath } from 'path';
import cosmiconfig from 'cosmiconfig';
import * as GraphQL from 'graphql';
import ts from 'typescript';
import { resolve, ImportNode } from './resolve';

const GENERATED = './__generated__/';

const configExplorer = cosmiconfig('relay', {
    searchPlaces: ['relay.config.js', 'relay.config.json', 'package.json'],
    loaders: {
        '.json': cosmiconfig.loadJson,
        '.js': cosmiconfig.loadJs,
        noExt: cosmiconfig.loadYaml,
    },
});

let RelayConfig;
const result = configExplorer.searchSync();
if (result) {
    RelayConfig = result.config;
}

const relayTransform = <T extends ts.Node>(
    context: ts.TransformationContext,
): ((rootNode: ts.SourceFile) => ts.SourceFile) => {
    return (rootNode: ts.SourceFile): ts.SourceFile => {
        const newStatements = [];
        const fileName = rootNode.fileName;
        function visit(node: ts.Node): ts.Node {
            if (ts.isTaggedTemplateExpression(node)) {
                if (node.tag.getText() === 'graphql') {
                    const template = node.template.getFullText();
                    const text = template.substring(1, template.length - 1);
                    const ast = GraphQL.parse(text);

                    if (ast.definitions.length === 0) {
                        throw new Error('TS Relay Plugin: Unexpected empty graphql tag.');
                    }
                    const imp = compileGraphQLTag(context, fileName, ast);
                    const identifier = resolve.createDefinitionIdentifier(context, imp);
                    const importClause = resolve.createImport(context, imp, identifier);
                    newStatements.push(importClause);
                    return ts.visitEachChild(identifier, visit, context);
                }
            }
            return ts.visitEachChild(node, visit, context);
        }
        const node = ts.visitNode(rootNode, visit);
        if (newStatements.length > 0) {
            return resolve.update(context, node, [...newStatements, ...node.statements]);
        }
        return node;
    };
};

function compileGraphQLTag(
    context: ts.TransformationContext,
    fileName: string,
    ast: GraphQL.DocumentNode,
): ImportNode {
    if (ast.definitions.length !== 1) {
        throw new Error('TS Relay Plugin: Expected exactly one definition per graphql tag.');
    }

    const graphqlDefinition = ast.definitions[0];

    if (
        graphqlDefinition.kind !== 'FragmentDefinition' &&
        graphqlDefinition.kind !== 'OperationDefinition'
    ) {
        throw new Error(
            'TS Relay Plugin: Expected a fragment, mutation, query, or ' +
                'subscription, got `' +
                graphqlDefinition.kind +
                '`.',
        );
    }

    const definitionName = graphqlDefinition.name && graphqlDefinition.name.value;

    if (!definitionName) {
        throw new Error('GraphQL operations and fragments must contain names');
    }

    const requiredFile = definitionName + '.graphql';
    const requiredPath =
        RelayConfig && RelayConfig.artifactDirectory
            ? getRelativeImportPath(fileName, RelayConfig.artifactDirectory, requiredFile)
            : GENERATED + requiredFile;
    return {
        path: requiredPath,
        definitionName,
    };
}

function getRelativeImportPath(
    filename: string,
    artifactDirectory: string,
    fileToRequire: string,
): string {
    const relative = relativePath(dirname(filename), resolvePath(artifactDirectory));

    const relativeReference = relative.length === 0 || !relative.startsWith('.') ? './' : '';

    return relativeReference + joinPath(relative, fileToRequire);
}

export const factory = (): ((
    context: ts.TransformationContext,
) => (rootNode: ts.SourceFile) => ts.SourceFile) => relayTransform;

export default relayTransform;
