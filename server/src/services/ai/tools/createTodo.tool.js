import { z } from 'zod';

export function createCreateTodoTool({ createTodo }) {
  if (typeof createTodo !== 'function') {
    throw new TypeError('createTodo tool requires a todo handler.');
  }

  return {
    name: 'createTodo',
    description: 'Create a todo item when the user explicitly asks to remember or track a task.',
    inputSchema: z.object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(1000).optional().default(''),
    }).strict(),
    inputSchemaJson: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 160 },
        description: { type: 'string', maxLength: 1000 },
      },
      required: ['title'],
      additionalProperties: false,
    },
    permissions: ['todo:create'],
    handler: ({ title, description }, { userId, conversationId } = {}) =>
      createTodo({ userId, conversationId, title, description }),
  };
}

export default createCreateTodoTool;
