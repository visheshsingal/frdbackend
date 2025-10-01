import express from 'express';
import { 
  loginUser,
  registerUser, 
  adminLogin,
  forgotPassword,
  resetPassword,
  changeAdminPassword
} from '../controllers/userController.js';
import adminAuth from '../middleware/adminAuth.js';

const userRouter = express.Router();

// Public routes
userRouter.post('/register', registerUser);
userRouter.post('/login', loginUser);
userRouter.post('/admin', adminLogin);
userRouter.post('/forgot-password', forgotPassword);
userRouter.post('/reset-password', resetPassword);

// Protected admin routes
userRouter.post('/admin/change-password', adminAuth, changeAdminPassword);

export default userRouter;