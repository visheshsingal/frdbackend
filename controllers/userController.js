import validator from "validator";
import jwt from 'jsonwebtoken';
import UserModel from "../models/userModel.js";
import sgMail from '@sendgrid/mail';

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Password validation function
const validatePassword = (password) => {
  const minLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const specialChars = password.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g);
  const hasTwoSpecialChars = specialChars && specialChars.length >= 2;

  return {
    isValid: minLength && hasUpperCase && hasLowerCase && hasTwoSpecialChars,
    minLength,
    hasUpperCase,
    hasLowerCase,
    hasTwoSpecialChars,
    specialCharCount: specialChars ? specialChars.length : 0
  };
};

// Helper: Send OTP Email using SendGrid (SPAM-FIXED VERSION)
const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  const subject = 'Your FRD Gym Security Code';
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
      <div style="text-align: center; padding: 20px; background: #052659; color: white;">
        <h2>FRD Gym</h2>
      </div>
      <div style="padding: 20px; background: #f9f9f9;">
        <p>Hello,</p>
        <p>Your security code for FRD Gym is:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #052659; padding: 15px; background: white; border-radius: 5px; display: inline-block;">
            ${otp}
          </div>
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
      <div style="text-align: center; padding: 20px; background: #eee; font-size: 12px; color: #666;">
        <p>FRD Gym Admin Panel</p>
      </div>
    </div>
  `;

  const textContent = `
FRD Gym Security Code

Your security code is: ${otp}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

FRD Gym Admin Panel
  `;

  const msg = {
    to: email,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL,
      name: 'FRD Gym'
    },
    subject: subject,
    html: htmlContent,
    text: textContent,
  };

  try {
    await sgMail.send(msg);
    console.log(`OTP sent`);
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
};

// Store admin password in memory
let adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123!!';

// Registration
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, email and password are required" 
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      let errorMessage = "Password must contain:";
      if (!passwordValidation.minLength) errorMessage += " at least 8 characters,";
      if (!passwordValidation.hasUpperCase) errorMessage += " one uppercase letter,";
      if (!passwordValidation.hasLowerCase) errorMessage += " one lowercase letter,";
      if (!passwordValidation.hasTwoSpecialChars) errorMessage += " at least two special characters,";
      
      errorMessage = errorMessage.slice(0, -1) + '.';
      return res.status(400).json({ 
        success: false, 
        message: errorMessage
      });
    }

    const existingUser = await UserModel.findOne({ email });

    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: "An account already exists with this email. Please login instead." 
      });
    }

    const newUser = new UserModel({ 
      name, 
      email, 
      password,
      isVerified: true
    });

    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { 
      expiresIn: '1d',
      algorithm: 'HS256'
    });
    
    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        name: newUser.name,
        email: newUser.email,
        isVerified: newUser.isVerified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during registration. Please try again." 
    });
  }
};

// Login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email. Please register first." 
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Incorrect email or password"
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { 
      expiresIn: '1d',
      algorithm: 'HS256'
    });
    
    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        name: user.name,
        email: user.email,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during login. Please try again." 
    });
  }
};

// Admin Login - Fixed Email Version
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    // Fixed admin email
    if (email !== 'vishesh.singal.contact@gmail.com') {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized admin access" 
      });
    }

    // Check against stored admin password
    const isPasswordValid = password === adminPassword;
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid admin credentials" 
      });
    }

    const token = jwt.sign(
      { 
        email: 'vishesh.singal.contact@gmail.com',
        role: 'admin'
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    return res.json({ 
      success: true, 
      token,
      user: { 
        email: 'vishesh.singal.contact@gmail.com', 
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'An error occurred during login' });
  }
};

// Send OTP for Admin Password Change
const sendAdminPasswordChangeOTP = async (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Current password is required" 
      });
    }

    // Verify current password
    const isCurrentPasswordValid = currentPassword === adminPassword;
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Send OTP via SendGrid
    const emailResult = await sendOTPEmail(
      'vishesh.singal.contact@gmail.com', 
      otp, 
      'password_change'
    );

    if (!emailResult.success) {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send OTP email. Please try again." 
      });
    }

    res.json({
      success: true,
      // message: `OTP sent to vishesh.singal.contact@gmail.com`,
      email: 'vishesh.singal.contact@gmail.com'
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while sending OTP. Please try again." 
    });
  }
};

// Verify OTP and Change Admin Password
const verifyOTPAndChangeAdminCredentials = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword, otp } = req.body;

    if (!otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Please enter OTP" 
      });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Please enter new password and confirmation" 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "New passwords do not match" 
      });
    }

    // Enhanced password validation
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      let errorMessage = "Password must contain:";
      if (!passwordValidation.minLength) errorMessage += " at least 8 characters,";
      if (!passwordValidation.hasUpperCase) errorMessage += " one uppercase letter,";
      if (!passwordValidation.hasLowerCase) errorMessage += " one lowercase letter,";
      if (!passwordValidation.hasTwoSpecialChars) errorMessage += " at least two special characters,";
      
      errorMessage = errorMessage.slice(0, -1) + '.';
      return res.status(400).json({ 
        success: false, 
        message: errorMessage
      });
    }

    // Verify current password again for security
    const isCurrentPasswordValid = currentPassword === adminPassword;
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Update admin password
    adminPassword = newPassword;

    res.json({
      success: true,
      message: "Admin password changed successfully"
    });
  } catch (error) {
    console.error('Change credentials error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while updating credentials. Please try again." 
    });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email." 
      });
    }

    // Generate reset token (valid for 15 minutes)
    const resetToken = jwt.sign(
      { 
        id: user._id,
        purpose: 'password_reset'
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ 
      success: true, 
      message: "Password reset initiated",
      resetToken,
      email: email
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred. Please try again later." 
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields are required" 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Passwords do not match" 
      });
    }

    // Enhanced password validation for reset
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      let errorMessage = "Password must contain:";
      if (!passwordValidation.minLength) errorMessage += " at least 8 characters,";
      if (!passwordValidation.hasUpperCase) errorMessage += " one uppercase letter,";
      if (!passwordValidation.hasLowerCase) errorMessage += " one lowercase letter,";
      if (!passwordValidation.hasTwoSpecialChars) errorMessage += " at least two special characters,";
      
      errorMessage = errorMessage.slice(0, -1) + '.';
      return res.status(400).json({ 
        success: false, 
        message: errorMessage
      });
    }

    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    if (decoded.purpose !== 'password_reset') {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid reset token" 
      });
    }

    const user = await UserModel.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully. You can now login with your new password."
    });
  } catch (error) {
    console.error('Password reset error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: "Reset token has expired. Please request a new one." 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid reset token" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while resetting password. Please try again." 
    });
  }
};

export {
  loginUser,
  registerUser,
  adminLogin,
  forgotPassword,
  resetPassword,
  sendAdminPasswordChangeOTP,
  verifyOTPAndChangeAdminCredentials
};