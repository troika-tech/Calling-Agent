import { Request, Response, NextFunction } from 'express';
import { phoneService } from '../services/phone.service';

export class PhoneController {
  /**
   * Import a new phone number
   * POST /api/v1/phones
   */
  async importPhone(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const phoneData = req.body;

      const phone = await phoneService.importPhone(userId, phoneData);

      res.status(201).json({
        success: true,
        data: { phone },
        message: 'Phone number imported successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all phones for current user
   * GET /api/v1/phones
   */
  async getPhones(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();

      const options = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        search: req.query.search as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        hasAgent: req.query.hasAgent === 'true' ? true : req.query.hasAgent === 'false' ? false : undefined
      };

      const result = await phoneService.getPhones(userId, options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get phone by ID
   * GET /api/v1/phones/:id
   */
  async getPhoneById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const phoneId = req.params.id;

      const phone = await phoneService.getPhoneById(phoneId, userId);

      res.json({
        success: true,
        data: { phone }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Assign agent to phone
   * PUT /api/v1/phones/:id/assign
   */
  async assignAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const phoneId = req.params.id;
      const { agentId } = req.body;

      const phone = await phoneService.assignAgent(phoneId, userId, agentId);

      res.json({
        success: true,
        data: { phone },
        message: 'Agent assigned successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unassign agent from phone
   * DELETE /api/v1/phones/:id/assign
   */
  async unassignAgent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const phoneId = req.params.id;

      const phone = await phoneService.unassignAgent(phoneId, userId);

      res.json({
        success: true,
        data: { phone },
        message: 'Agent unassigned successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update phone
   * PUT /api/v1/phones/:id
   */
  async updatePhone(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const phoneId = req.params.id;
      const updateData = req.body;

      const phone = await phoneService.updatePhone(phoneId, userId, updateData);

      res.json({
        success: true,
        data: { phone },
        message: 'Phone updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete phone
   * DELETE /api/v1/phones/:id
   */
  async deletePhone(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const phoneId = req.params.id;

      await phoneService.deletePhone(phoneId, userId);

      res.json({
        success: true,
        message: 'Phone deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get phone statistics
   * GET /api/v1/phones/:id/stats
   */
  async getPhoneStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user._id.toString();
      const phoneId = req.params.id;

      const stats = await phoneService.getPhoneStats(phoneId, userId);

      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const phoneController = new PhoneController();
