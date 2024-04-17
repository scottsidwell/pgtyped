import {
  ParseEvent,
  parseSQLFile,
  parseTSQuery,
  SQLQueryAST,
  TSQueryAST,
} from '@pgtyped/parser';
import ts from 'typescript';
import { TransformConfig } from './config.js';

interface INode {
  queryName: string;
  queryText: string;
}

export type TSParseResult = {
  queries: (TSQueryAST | SQLQueryAST)[];
  events: ParseEvent[];
};

export function parseFile(
  sourceFile: ts.SourceFile,
  transformConfig: TransformConfig | undefined,
): TSParseResult {
  const foundNodes: INode[] = [];
  parseNode(sourceFile);

  function parseNode(node: ts.Node) {
    if (
      transformConfig?.mode === 'ts-implicit' &&
      node.kind === ts.SyntaxKind.CallExpression
    ) {
      const callNode = node as ts.CallExpression;
      const functionName = callNode.expression.getText();
      if (functionName === transformConfig.functionName) {
        const queryName = callNode.parent.getChildren()[0].getText();
        // Intentionally not trimming the query text here (as otherwise query text *has*
        // to start immediately after an opening-backtick, which is not always aesthetic)
        const queryText = callNode.arguments[0].getText().slice(1, -1);
        foundNodes.push({
          queryName,
          queryText,
        });
      }
    }

    if (
      transformConfig?.mode === 'ts' &&
      node.kind === ts.SyntaxKind.TaggedTemplateExpression
    ) {
      const queryName = node.parent.getChildren()[0].getText();
      const taggedTemplateNode = node as ts.TaggedTemplateExpression;
      const tagName = taggedTemplateNode.tag.getText();
      const queryText = taggedTemplateNode.template
        .getText()
        .replace('\n', '')
        .slice(1, -1)
        .trim();
      if (tagName === 'sql') {
        foundNodes.push({
          queryName,
          queryText,
        });
      }
    }

    ts.forEachChild(node, parseNode);
  }

  const queries: (SQLQueryAST | TSQueryAST)[] = [];
  const events: ParseEvent[] = [];
  for (const node of foundNodes) {
    if (transformConfig?.mode === 'ts-implicit') {
      const {
        queries: [query],
        events: qEvents,
      } = parseSQLFile(node.queryText, { maxQueries: 1 });

      queries.push({ ...query, rawStatement: node.queryText });
      events.push(...qEvents);
    } else {
      const { query, events: qEvents } = parseTSQuery(
        node.queryText,
        node.queryName,
      );
      queries.push(query);
      events.push(...qEvents);
    }
  }

  return { queries, events };
}

export const parseCode = (
  fileContent: string,
  fileName = 'unnamed.ts',
  transformConfig?: TransformConfig,
) => {
  const sourceFile = ts.createSourceFile(
    fileName,
    fileContent,
    ts.ScriptTarget.ES2015,
    true,
  );
  return parseFile(sourceFile, transformConfig);
};
