import { Router } from 'express';
import { agentController } from '../controllers/agent.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import {
  createAgentSchema,
  updateAgentSchema,
  getAgentsSchema,
  agentIdSchema
} from '../utils/validation';

const router = Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

/**
 * @route   POST /api/v1/agents
 * @desc    Create a new agent
 * @access  Private
 */
router.post(
  '/',
  validate(createAgentSchema),
  agentController.createAgent.bind(agentController)
);

/**
 * @route   GET /api/v1/agents
 * @desc    Get all agents for current user
 * @access  Private
 */
router.get(
  '/',
  validate(getAgentsSchema),
  agentController.getAgents.bind(agentController)
);

/**
 * @route   GET /api/v1/agents/:id
 * @desc    Get agent by ID
 * @access  Private
 */
router.get(
  '/:id',
  validate(agentIdSchema),
  agentController.getAgentById.bind(agentController)
);

/**
 * @route   PUT /api/v1/agents/:id
 * @desc    Update agent
 * @access  Private
 */
router.put(
  '/:id',
  validate(updateAgentSchema),
  agentController.updateAgent.bind(agentController)
);

/**
 * @route   DELETE /api/v1/agents/:id
 * @desc    Delete agent
 * @access  Private
 */
router.delete(
  '/:id',
  validate(agentIdSchema),
  agentController.deleteAgent.bind(agentController)
);

/**
 * @route   PATCH /api/v1/agents/:id/toggle
 * @desc    Toggle agent active status
 * @access  Private
 */
router.patch(
  '/:id/toggle',
  validate(agentIdSchema),
  agentController.toggleAgentStatus.bind(agentController)
);

/**
 * @route   GET /api/v1/agents/:id/stats
 * @desc    Get agent statistics
 * @access  Private
 */
router.get(
  '/:id/stats',
  validate(agentIdSchema),
  agentController.getAgentStats.bind(agentController)
);

export default router;
