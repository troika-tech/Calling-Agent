import { Request, Response, NextFunction } from 'express';
import { agentService } from '../services/agent.service';
import { logger } from '../utils/logger';

export class AgentController {
  /**
   * Create a new agent
   * POST /api/v1/agents
   */
  async createAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const agentData = req.body;

      const agent = await agentService.createAgent(userId, agentData);

      res.status(201).json({
        success: true,
        data: { agent }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all agents for current user
   * GET /api/v1/agents
   */
  async getAgents(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();

      const options = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        search: req.query.search as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined
      };

      const result = await agentService.getAgents(userId, options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get agent by ID
   * GET /api/v1/agents/:id
   */
  async getAgentById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const agentId = req.params.id;

      const agent = await agentService.getAgentById(agentId, userId);

      res.json({
        success: true,
        data: { agent }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update agent
   * PUT /api/v1/agents/:id
   */
  async updateAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const agentId = req.params.id;
      const updateData = req.body;

      const agent = await agentService.updateAgent(agentId, userId, updateData);

      res.json({
        success: true,
        data: { agent },
        message: 'Agent updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete agent
   * DELETE /api/v1/agents/:id
   */
  async deleteAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const agentId = req.params.id;

      await agentService.deleteAgent(agentId, userId);

      res.json({
        success: true,
        message: 'Agent deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle agent active status
   * PATCH /api/v1/agents/:id/toggle
   */
  async toggleAgentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const agentId = req.params.id;

      const agent = await agentService.toggleAgentStatus(agentId, userId);

      res.json({
        success: true,
        data: { agent },
        message: `Agent ${agent.isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get agent statistics
   * GET /api/v1/agents/:id/stats
   */
  async getAgentStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const agentId = req.params.id;

      const stats = await agentService.getAgentStats(agentId, userId);

      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const agentController = new AgentController();
