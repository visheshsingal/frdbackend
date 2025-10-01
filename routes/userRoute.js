import express from 'express';
import { 
  loginUser,
  registerUser, 
  adminLogin,
  sendOTP,
  verifyOTP,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  changeAdminPasswordSendOTP,
  changeAdminPasswordVerify,
  checkAdmin
} from '../controllers/userController.js';
import adminAuth from '../middleware/adminAuth.js';

const userRouter = express.Router();

userRouter.post('/send-otp', sendOTP);
userRouter.post('/verify-otp', verifyOTP);
userRouter.post('/register', registerUser);
userRouter.post('/login', loginUser);
userRouter.post('/admin', adminLogin);
userRouter.post('/forgot-password', forgotPassword);
userRouter.post('/verify-reset-otp', verifyResetOTP);
userRouter.post('/reset-password', resetPassword);
userRouter.post('/admin/change-password/send-otp', adminAuth, changeAdminPasswordSendOTP);
userRouter.post('/admin/change-password/verify', adminAuth, changeAdminPasswordVerify);
userRouter.get('/check-admin', checkAdmin);

export default userRouter;