import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

interface LogViolation {
  file: string;
  line: number;
  pattern: string;
}

const LOGGER_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const CONSOLE_METHODS = new Set(['log', 'debug', 'info', 'warn', 'error']);
const FORBIDDEN_KEYS = new Set(['userId', 'userIds', 'authorId', 'memberId', 'ownerId']);
const FORBIDDEN_READS = new Set(['userId', 'ownerId']);
const PERSON_OBJECTS = new Set(['user', 'author', 'member']);
const ERROR_IDENTIFIERS = new Set(['error', 'err']);
const PASS_THROUGH_OPERATORS = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

const isLogCall = (node: ts.CallExpression): boolean => {
  const callee = node.expression;

  if (!ts.isPropertyAccessExpression(callee)) {
    return false;
  }

  const method = callee.name.text;
  const receiver = callee.expression;

  if (ts.isIdentifier(receiver) && receiver.text === 'console') {
    return CONSOLE_METHODS.has(method);
  }

  if (!LOGGER_METHODS.has(method)) {
    return false;
  }

  if (ts.isIdentifier(receiver)) {
    return receiver.text === 'logger';
  }

  if (ts.isPropertyAccessExpression(receiver)) {
    return receiver.name.text === 'logger';
  }

  return (
    ts.isCallExpression(receiver) &&
    ts.isIdentifier(receiver.expression) &&
    receiver.expression.text === 'getLogger'
  );
};

const isClientReceiver = (node: ts.Expression): boolean =>
  (ts.isIdentifier(node) && node.text === 'client') ||
  (ts.isPropertyAccessExpression(node) && node.name.text === 'client');

const propertyKeyName = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;

const findLogViolations = (fileName: string, sourceText: string): LogViolation[] => {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations: LogViolation[] = [];

  const report = (node: ts.Node, pattern: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

    violations.push({ file: fileName, line: line + 1, pattern });
  };

  const inspectIdentifier = (node: ts.Identifier, inText: boolean): void => {
    if (FORBIDDEN_KEYS.has(node.text)) {
      report(node, `user identifier value ${node.text}`);
    } else if (PERSON_OBJECTS.has(node.text) || node.text === 'interaction') {
      report(node, `whole object ${node.text}`);
    } else if (inText && ERROR_IDENTIFIERS.has(node.text)) {
      report(node, `error ${node.text} in message text`);
    }
  };

  const inspectPropertyAccess = (node: ts.PropertyAccessExpression): void => {
    const name = node.name.text;
    const receiver = node.expression;

    if (FORBIDDEN_READS.has(name)) {
      report(node, `user identifier read .${name}`);

      return;
    }

    if (name === 'id') {
      const readsPersonOnProperty =
        ts.isPropertyAccessExpression(receiver) &&
        PERSON_OBJECTS.has(receiver.name.text) &&
        !isClientReceiver(receiver.expression);
      const readsPersonOnIdentifier =
        ts.isIdentifier(receiver) && PERSON_OBJECTS.has(receiver.text);

      if (readsPersonOnProperty || readsPersonOnIdentifier) {
        report(node, 'user identifier read .id on a person');
      }

      return;
    }

    if (PERSON_OBJECTS.has(name)) {
      report(node, `whole object .${name}`);
    }
  };

  const inspectValue = (node: ts.Expression, inText: boolean): void => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      inspectValue(node.expression, inText);
    } else if (ts.isIdentifier(node)) {
      inspectIdentifier(node, inText);
    } else if (ts.isPropertyAccessExpression(node)) {
      inspectPropertyAccess(node);
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          const key = propertyKeyName(property.name);

          if (key !== undefined && FORBIDDEN_KEYS.has(key)) {
            report(property, `forbidden key ${key}`);
          }

          inspectValue(property.initializer, false);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          if (FORBIDDEN_KEYS.has(property.name.text)) {
            report(property, `forbidden key ${property.name.text}`);
          } else {
            inspectIdentifier(property.name, false);
          }
        } else if (ts.isSpreadAssignment(property)) {
          inspectValue(property.expression, false);
        }
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        inspectValue(ts.isSpreadElement(element) ? element.expression : element, inText);
      }
    } else if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        inspectValue(span.expression, true);
      }
    } else if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        inspectValue(node.left, true);
        inspectValue(node.right, true);
      } else if (PASS_THROUGH_OPERATORS.has(node.operatorToken.kind)) {
        inspectValue(node.left, inText);
        inspectValue(node.right, inText);
      }
    } else if (ts.isConditionalExpression(node)) {
      inspectValue(node.whenTrue, inText);
      inspectValue(node.whenFalse, inText);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'String'
    ) {
      for (const argument of node.arguments) {
        inspectValue(argument, true);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isLogCall(node)) {
      for (const argument of node.arguments) {
        inspectValue(argument, false);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return violations;
};

const violationsOf = (sourceText: string): LogViolation[] =>
  findLogViolations('snippet.ts', sourceText);

describe('logging AC-LOG-14 guard refuses user identifiers and errors in log calls', () => {
  it.each([...FORBIDDEN_KEYS])('logging AC-LOG-14 refuses the key %s', (key) => {
    expect(violationsOf(`logger.info({ ${key}: guildId }, 'line');`).length).toBeGreaterThanOrEqual(1);
  });

  it.each([...FORBIDDEN_KEYS])('logging AC-LOG-14 refuses the shorthand key %s', (key) => {
    expect(violationsOf(`logger.info({ ${key} }, 'line');`).length).toBeGreaterThanOrEqual(1);
  });

  it('logging AC-LOG-14 refuses a forbidden key nested in a logged object', () => {
    expect(violationsOf('logger.info({ meta: { userId: guildId } }, text);').length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    'interaction.user.id',
    'message.author.id',
    'interaction.member.id',
    'objective.userId',
    'objective.ownerId',
  ])('logging AC-LOG-14 refuses a value read on %s', (read) => {
    expect(violationsOf(`logger.info({ target: ${read} }, 'line');`).length).toBeGreaterThanOrEqual(1);
  });

  it.each([...FORBIDDEN_KEYS])('logging AC-LOG-14 refuses the bare identifier %s as a key value', (name) => {
    expect(violationsOf(`logger.info({ target: ${name} }, 'line');`).length).toBeGreaterThanOrEqual(1);
  });

  it('logging AC-LOG-14 refuses a bare user identifier as an array element', () => {
    expect(violationsOf('logger.info({ targets: [authorId] }, text);').length).toBeGreaterThanOrEqual(1);
  });

  it('logging AC-LOG-14 refuses a bare user identifier in the message text', () => {
    expect(violationsOf('logger.info(`removed by ${memberId}`);').length).toBeGreaterThanOrEqual(1);
  });

  it.each(['user.id', 'author.id', 'member.id'])('logging AC-LOG-14 refuses the read %s on a bare identifier', (read) => {
    expect(violationsOf(`logger.info({ target: ${read} }, 'line');`).length).toBeGreaterThanOrEqual(1);
  });

  it.each(['interaction.user', 'message.author', 'interaction.member'])(
    'logging AC-LOG-14 refuses the whole object read on %s',
    (read) => {
      expect(violationsOf(`logger.info({ target: ${read} }, 'line');`).length).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(['user', 'author', 'member'])('logging AC-LOG-14 refuses the whole bare identifier %s', (name) => {
    expect(violationsOf(`logger.info({ ${name} }, 'line');`).length).toBeGreaterThanOrEqual(1);
  });

  it('logging AC-LOG-14 refuses a whole bare person object passed as an argument', () => {
    expect(violationsOf('logger.warn(member, text);').length).toBeGreaterThanOrEqual(1);
  });

  it('logging AC-LOG-14 refuses the whole interaction identifier', () => {
    expect(violationsOf('logger.info({ interaction }, text);').length).toBeGreaterThanOrEqual(1);
  });

  it.each(['error', 'err'])('logging AC-LOG-10 / AC-LOG-14 refuses %s inserted by a template literal', (name) => {
    expect(violationsOf(`logger.error(\`failed: \${${name}}\`);`).length).toBeGreaterThanOrEqual(1);
  });

  it.each(['error', 'err'])('logging AC-LOG-10 / AC-LOG-14 refuses %s inserted by concatenation', (name) => {
    expect(violationsOf(`logger.error('failed: ' + ${name});`).length).toBeGreaterThanOrEqual(1);
  });

  it.each(['error', 'err'])('logging AC-LOG-10 / AC-LOG-14 refuses %s inserted through String()', (name) => {
    expect(violationsOf(`logger.error(\`failed: \${String(${name})}\`);`).length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    'getLogger().warn({ userId: guildId }, text);',
    'deps.logger.error({ userId: guildId }, text);',
    'this.container.logger.info({ userId: guildId }, text);',
    'console.log({ userId: guildId });',
    'console.error({ userId: guildId });',
  ])('logging AC-LOG-14 treats every log receiver of the definitions: %s', (snippet) => {
    expect(violationsOf(snippet).length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    'logger.info({ guildId }, `removed by ${memberId}`);',
    'logger.info({ guildId }, text + interaction.user.id);',
    'logger.error({ guildId }, `failed: ${error}`);',
    'logger.error({ guildId }, text + err);',
    'logger.info(text, { userId: guildId });',
    'logger.warn(text, member);',
  ])('logging AC-LOG-14 refuses a violation placed in a non-first argument: %s', (snippet) => {
    expect(violationsOf(snippet).length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    'logger.info(`removed by ${interaction.user.id}`);',
    'logger.info(`removed by ${objective.userId}`);',
    'logger.info(`removed by ${userId}`);',
    'logger.info(text + interaction.user.id);',
    'logger.info(text + objective.userId);',
    'logger.info(text + userId);',
    'logger.info(String(interaction.user.id));',
    'logger.info(String(objective.userId));',
    'logger.info(String(userId));',
  ])('logging AC-LOG-14 refuses a user identifier read in the message text: %s', (snippet) => {
    expect(violationsOf(snippet).length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    'logger.info({ bot: client.user }, text);',
    'logger.info({ bot: this.container.client.user }, text);',
  ])('logging AC-LOG-14 refuses the whole client user object: %s', (snippet) => {
    expect(violationsOf(snippet).length).toBeGreaterThanOrEqual(1);
  });

  it('logging AC-LOG-14 reports the line of the offending value', () => {
    const snippet = ['logger.info(', '  {', '    guildId,', '    userId: interaction.user.id,', '  },', '  text,', ');'].join('\n');

    expect(violationsOf(snippet).map((violation) => violation.line)).toContain(4);
  });
});

describe('logging AC-LOG-15 guard lets permitted values pass', () => {
  it.each([
    'logger.info({ removedByOwner: interaction.user.id === objective.userId }, text);',
    'logger.info({ customId: interaction.customId }, text);',
    'logger.error({ guildId: payload.interaction.guildId }, text);',
    'logger.info({ botId: client.user.id }, text);',
    'logger.info({ botId: this.container.client.user.id }, text);',
  ])('logging AC-LOG-15 finds no violation in %s', (snippet) => {
    expect(violationsOf(snippet)).toStrictEqual([]);
  });

  it('logging AC-LOG-10 accepts an error placed under the error key', () => {
    expect(violationsOf('logger.error({ error }, text);')).toStrictEqual([]);
  });

  it('logging AC-LOG-14 ignores a call that is not a log call', () => {
    expect(violationsOf('canModifyObjective({ userId: interaction.user.id, objectiveOwnerId: objective.userId });')).toStrictEqual([]);
  });
});

const collectSourceFiles = (root: string): string[] =>
  readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => join(root, entry))
    .sort();

interface CaughtLogCall {
  caughtVariable: string | undefined;
  errorKeyValue: string | undefined;
}

const DATABASE_FAILURE_TEXT = 'Unable to connect to the database';

const messageTextOf = (node: ts.Expression): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  return ts.isTemplateExpression(node) ? node.head.text : undefined;
};

const errorKeyValueOf = (node: ts.Expression | undefined): string | undefined => {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) {
    return undefined;
  }

  for (const property of node.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'error') {
      return property.name.text;
    }

    if (
      ts.isPropertyAssignment(property) &&
      propertyKeyName(property.name) === 'error' &&
      ts.isIdentifier(property.initializer)
    ) {
      return property.initializer.text;
    }
  }

  return undefined;
};

const findDatabaseFailureLogCalls = (sourceText: string): CaughtLogCall[] => {
  const sourceFile = ts.createSourceFile('main.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: CaughtLogCall[] = [];

  const visit = (node: ts.Node, caughtVariable: string | undefined): void => {
    if (ts.isCatchClause(node)) {
      const declaration = node.variableDeclaration;
      const name = declaration !== undefined && ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;

      ts.forEachChild(node, (child) => {
        visit(child, name);
      });

      return;
    }

    if (
      ts.isCallExpression(node) &&
      isLogCall(node) &&
      node.arguments.some((argument) => messageTextOf(argument)?.startsWith(DATABASE_FAILURE_TEXT) === true)
    ) {
      calls.push({ caughtVariable, errorKeyValue: errorKeyValueOf(node.arguments[0]) });
    }

    ts.forEachChild(node, (child) => {
      visit(child, caughtVariable);
    });
  };

  visit(sourceFile, undefined);

  return calls;
};

describe('logging AC-LOG-10 startup database connection failure', () => {
  it('logging AC-LOG-10 passes the caught error under the error key of the first argument in src/main.ts', () => {
    const mainSource = readFileSync(resolve(import.meta.dirname, '../main.ts'), 'utf8');
    const calls = findDatabaseFailureLogCalls(mainSource);

    expect(calls).toHaveLength(1);

    const [call] = calls;

    expect(call.caughtVariable).toMatch(/^\w+$/);
    expect(call.errorKeyValue).toBe(call.caughtVariable);
  });
});

describe('logging AC-LOG-1 / AC-LOG-14 repository guard', () => {
  it('logging AC-LOG-1 / AC-LOG-10 / AC-LOG-14 finds no violation in any non-test source of src/', () => {
    const repositoryRoot = resolve(import.meta.dirname, '../..');
    const sourceFiles = collectSourceFiles(join(repositoryRoot, 'src'));

    const violations = sourceFiles.flatMap((file) =>
      findLogViolations(relative(repositoryRoot, file), readFileSync(file, 'utf8')),
    );

    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(violations.map((violation) => `${violation.file}:${String(violation.line)} ${violation.pattern}`)).toStrictEqual([]);
  });
});
