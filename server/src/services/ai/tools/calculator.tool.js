import { z } from 'zod';
import ApiError from '../../../utils/ApiError.js';

const MAX_EXPRESSION_LENGTH = 120;

function calculate(expression) {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) ?? [];
  if (!tokens.length || tokens.join('') !== expression.replace(/\s+/g, '')) {
    throw new Error('Invalid expression');
  }

  let position = 0;
  function parsePrimary() {
    const token = tokens[position++];
    if (token === '+' || token === '-') {
      const value = parsePrimary();
      return token === '-' ? -value : value;
    }
    if (token === '(') {
      const value = parseExpression();
      if (tokens[position++] !== ')') throw new Error('Unmatched parenthesis');
      return value;
    }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) throw new Error('Expected a number');
    return Number(token);
  }

  function parseTerm() {
    let value = parsePrimary();
    while (['*', '/', '%'].includes(tokens[position])) {
      const operator = tokens[position++];
      const operand = parsePrimary();
      if ((operator === '/' || operator === '%') && operand === 0) {
        throw new Error('Division by zero');
      }
      value = operator === '*'
        ? value * operand
        : operator === '/'
          ? value / operand
          : value % operand;
    }
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const operand = parseTerm();
      value = operator === '+' ? value + operand : value - operand;
    }
    return value;
  }

  const result = parseExpression();
  if (position !== tokens.length || !Number.isFinite(result)) {
    throw new Error('Invalid or out-of-range expression');
  }
  return result;
}

export function createCalculatorTool() {
  return {
    name: 'calculator',
    description: 'Evaluate a basic arithmetic expression using +, -, *, /, %, and parentheses.',
    inputSchema: z.object({
      expression: z.string().trim().min(1).max(MAX_EXPRESSION_LENGTH),
    }).strict(),
    inputSchemaJson: {
      type: 'object',
      properties: {
        expression: { type: 'string', minLength: 1, maxLength: MAX_EXPRESSION_LENGTH },
      },
      required: ['expression'],
      additionalProperties: false,
    },
    permissions: [],
    handler: ({ expression }) => {
      try {
        return { expression, result: calculate(expression) };
      } catch {
        throw ApiError.badRequest(
          'AI_CALCULATOR_INVALID_EXPRESSION',
          'The calculator only accepts valid basic arithmetic expressions.',
        );
      }
    },
  };
}

export default createCalculatorTool;
