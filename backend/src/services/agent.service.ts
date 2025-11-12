import mongoose from 'mongoose';
import { Agent, IAgent } from '../models/Agent';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../utils/errors';
import { logger } from '../utils/logger';

export interface CreateAgentData {
  name: string;
  config: {
    prompt: string;
    voice: {
      provider: 'openai' | 'elevenlabs' | 'cartesia';
      voiceId: string;
      model?: string;
      settings?: Record<string, any>;
    };
    language: string;
    llm: {
      model: 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo';
      temperature?: number;
      maxTokens?: number;
    };
    firstMessage?: string;
    sessionTimeout?: number;
    flow?: {
      userStartFirst?: boolean;
      interruption?: {
        allowed: boolean;
      };
      responseDelay?: number;
    };
  };
}

export interface UpdateAgentData {
  name?: string;
  config?: Partial<CreateAgentData['config']>;
}

export class AgentService {
  /**
   * Create a new agent
   */
  async createAgent(userId: string, data: CreateAgentData): Promise<IAgent> {
    try {
      const agent = await Agent.create({
        userId,
        name: data.name,
        config: data.config,
        isActive: true
      });

      logger.info('Agent created successfully', {
        userId,
        agentId: (agent._id as mongoose.Types.ObjectId).toString(),
        name: agent.name
      });

      return agent;
    } catch (error) {
      logger.error('Create agent error', { error, userId });
      throw new Error('Failed to create agent');
    }
  }

  /**
   * Get all agents for a user
   */
  async getAgents(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      isActive?: boolean;
    } = {}
  ): Promise<{
    agents: IAgent[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 10;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = { userId };

      if (options.search) {
        query.name = { $regex: options.search, $options: 'i' };
      }

      if (options.isActive !== undefined) {
        query.isActive = options.isActive;
      }

      // Execute query
      const [agents, total] = await Promise.all([
        Agent.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Agent.countDocuments(query)
      ]);

      return {
        agents,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Get agents error', { error, userId });
      throw new Error('Failed to get agents');
    }
  }

  /**
   * Get agent by ID
   */
  async getAgentById(agentId: string, userId: string): Promise<IAgent> {
    const agent = await Agent.findById(agentId);

    if (!agent) {
      throw new NotFoundError('Agent not found');
    }

    // Check ownership
    if (agent.userId.toString() !== userId) {
      throw new ForbiddenError('Not authorized to access this agent');
    }

    return agent;
  }

  /**
   * Update agent
   */
  async updateAgent(
    agentId: string,
    userId: string,
    data: UpdateAgentData
  ): Promise<IAgent> {
    try {
      const agent = await this.getAgentById(agentId, userId);

      // Update fields
      if (data.name !== undefined) {
        agent.name = data.name;
      }

      if (data.config) {
        agent.config = {
          ...agent.config,
          ...data.config,
          // Explicitly handle boolean fields to ensure false values are saved
          ...(data.config.enableAutoLanguageDetection !== undefined && {
            enableAutoLanguageDetection: data.config.enableAutoLanguageDetection
          })
        } as any;
      }

      await agent.save();

      logger.info('Agent updated successfully', {
        userId,
        agentId,
        name: agent.name
      });

      return agent;
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Update agent error', { error, userId, agentId });
      throw new Error('Failed to update agent');
    }
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string, userId: string): Promise<void> {
    try {
      const agent = await this.getAgentById(agentId, userId);

      await agent.deleteOne();

      logger.info('Agent deleted successfully', {
        userId,
        agentId,
        name: agent.name
      });
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Delete agent error', { error, userId, agentId });
      throw new Error('Failed to delete agent');
    }
  }

  /**
   * Toggle agent active status
   */
  async toggleAgentStatus(
    agentId: string,
    userId: string
  ): Promise<IAgent> {
    try {
      const agent = await this.getAgentById(agentId, userId);

      agent.isActive = !agent.isActive;
      await agent.save();

      logger.info('Agent status toggled', {
        userId,
        agentId,
        isActive: agent.isActive
      });

      return agent;
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Toggle agent status error', { error, userId, agentId });
      throw new Error('Failed to toggle agent status');
    }
  }

  /**
   * Get agent statistics
   */
  async getAgentStats(agentId: string, userId: string): Promise<{
    totalCalls: number;
    activeCalls: number;
    averageDuration: number;
    successRate: number;
  }> {
    try {
      // Verify ownership
      await this.getAgentById(agentId, userId);

      // TODO: Implement when CallLog model is integrated
      return {
        totalCalls: 0,
        activeCalls: 0,
        averageDuration: 0,
        successRate: 0
      };
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Get agent stats error', { error, userId, agentId });
      throw new Error('Failed to get agent statistics');
    }
  }
}

export const agentService = new AgentService();
