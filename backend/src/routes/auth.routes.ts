import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validation.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema
} from '../utils/validation';

const router = Router();

/**
 * @route   POST /api/v1/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/signup',
  validate(signupSchema),
  authController.signup.bind(authController)
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user and get tokens
 * @access  Public
 */
router.post(
  '/login',
  validate(loginSchema),
  authController.login.bind(authController)
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  authController.refreshToken.bind(authController)
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post(
  '/logout',
  authenticate,
  authController.logout.bind(authController)
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  authController.getCurrentUser.bind(authController)
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword.bind(authController)
);

export default router;
