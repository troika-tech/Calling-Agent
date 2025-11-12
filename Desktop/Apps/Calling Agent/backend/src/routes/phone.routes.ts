import { Router } from 'express';
import { phoneController } from '../controllers/phone.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import {
  importPhoneSchema,
  assignAgentSchema,
  updateTagsSchema,
  getPhonesSchema,
  phoneIdSchema
} from '../utils/validation';

const router = Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

/**
 * @route   POST /api/v1/phones
 * @desc    Import a new phone number
 * @access  Private
 */
router.post(
  '/',
  validate(importPhoneSchema),
  phoneController.importPhone.bind(phoneController)
);

/**
 * @route   GET /api/v1/phones
 * @desc    Get all phones for current user
 * @access  Private
 */
router.get(
  '/',
  validate(getPhonesSchema),
  phoneController.getPhones.bind(phoneController)
);

/**
 * @route   GET /api/v1/phones/:id
 * @desc    Get phone by ID
 * @access  Private
 */
router.get(
  '/:id',
  validate(phoneIdSchema),
  phoneController.getPhoneById.bind(phoneController)
);

/**
 * @route   PUT /api/v1/phones/:id
 * @desc    Update phone
 * @access  Private
 */
router.put(
  '/:id',
  validate(updateTagsSchema),
  phoneController.updatePhone.bind(phoneController)
);

/**
 * @route   PUT /api/v1/phones/:id/assign
 * @desc    Assign agent to phone
 * @access  Private
 */
router.put(
  '/:id/assign',
  validate(assignAgentSchema),
  phoneController.assignAgent.bind(phoneController)
);

/**
 * @route   DELETE /api/v1/phones/:id/assign
 * @desc    Unassign agent from phone
 * @access  Private
 */
router.delete(
  '/:id/assign',
  validate(phoneIdSchema),
  phoneController.unassignAgent.bind(phoneController)
);

/**
 * @route   DELETE /api/v1/phones/:id
 * @desc    Delete phone
 * @access  Private
 */
router.delete(
  '/:id',
  validate(phoneIdSchema),
  phoneController.deletePhone.bind(phoneController)
);

/**
 * @route   GET /api/v1/phones/:id/stats
 * @desc    Get phone statistics
 * @access  Private
 */
router.get(
  '/:id/stats',
  validate(phoneIdSchema),
  phoneController.getPhoneStats.bind(phoneController)
);

export default router;
