import validator from "validator";
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import UserModel from "../models/userModel.js";

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  pool: true,
  maxConnections: 1,
  rateLimit: true
});

// Helper: Create JWT token
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { 
    expiresIn: '1d',
    algorithm: 'HS256'
  });
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: `"Auth System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Secure OTP for Verification',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background: #052659; padding: 20px; color: white; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Secure Verification</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Your One-Time Password (OTP) for verification is:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; text-align: center; margin-bottom: 30px;">
              <span style="font-size: 28px; letter-spacing: 3px; color: #052659; font-weight: bold;">${otp}</span>
            </div>
            <p style="font-size: 14px; color: #666; margin-bottom: 5px;">This OTP is valid for 10 minutes.</p>
            <p style="font-size: 14px; color: #666; margin-bottom: 5px;">Please do not share this code with anyone.</p>
            <p style="font-size: 14px; color: #666;">If you didn't request this, please ignore this email.</p>
          </div>
          <div style="background: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #888;">
            <p style="margin: 0;">© ${new Date().getFullYear()} Your Company. All rights reserved.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}`);
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};

// Send OTP
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    let user = await UserModel.findOne({ email });
    const now = new Date();
    
    if (user && user.otpSentAt && (now - user.otpSentAt) < 30000) { // 30 seconds cooldown
      const secondsLeft = Math.ceil((30000 - (now - user.otpSentAt)) / 1000);
      return res.status(429).json({ 
        success: false, 
        message: `Please wait ${secondsLeft} seconds before requesting a new OTP` 
      });
    }

    if (!user) {
      user = new UserModel({ 
        email, 
        name: "Temp User", 
        password: "Temp@1234",
        isTemp: true
      });
    }

    const otp = user.generateOTP();
    await user.save();
    
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: "OTP sent successfully. Please check your email.",
      email: email
    });
  } catch (error) {
    console.error('OTP sending error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while sending OTP. Please try again later." 
    });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and OTP are required" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email. Please register first." 
      });
    }

    // Verify OTP
    const verification = user.verifyOTP(otp);
    if (!verification.isValid) {
      return res.status(401).json({ 
        success: false, 
        message: verification.message || "Invalid or expired OTP",
        isExpired: verification.isExpired
      });
    }

    await user.save();
    
    if (user.isTemp) {
      return res.json({ 
        success: true, 
        message: "OTP verified. Please complete your registration.",
        requiresRegistration: true,
        email: user.email
      });
    }

    const token = createToken(user._id);
    
    res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: {
        name: user.name,
        email: user.email,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during verification. Please try again." 
    });
  }
};

// Registration
const registerUser = async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;

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

    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 8 characters long" 
      });
    }

    let user = await UserModel.findOne({ email });

    if (user) {
      if (!user.isTemp && user.password) {
        return res.status(409).json({ 
          success: false, 
          message: "An account already exists with this email. Please login instead." 
        });
      }

      if (otp) {
        const verification = user.verifyOTP(otp);
        if (!verification.isValid) {
          return res.status(401).json({ 
            success: false, 
            message: verification.message || "Invalid or expired OTP",
            isExpired: verification.isExpired
          });
        }
        
        user.name = name;
        user.password = password;
        user.isTemp = false;
        user.isVerified = true;
        await user.save();

        const token = createToken(user._id);
        return res.status(201).json({
          success: true,
          message: "Registration successful",
          token,
          user: {
            name: user.name,
            email: user.email,
            isVerified: user.isVerified
          }
        });
      } else {
        const newOTP = user.generateOTP();
        await user.save();
        await sendOTPEmail(email, newOTP);
        
        return res.json({ 
          success: true, 
          message: "OTP sent to your email", 
          requiresOTP: true,
          email: user.email
        });
      }
    }

    const newUser = new UserModel({ 
      name, 
      email, 
      password,
      isVerified: false
    });

    const newOTP = newUser.generateOTP();
    await newUser.save();
    await sendOTPEmail(email, newOTP);

    res.status(200).json({ 
      success: true, 
      message: "OTP sent to your email for verification",
      requiresOTP: true,
      email: newUser.email
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
    const { email, password, otp } = req.body;

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
        message: "Incorrect email or password",
        requiresOTP: false
      });
    }

    if (otp) {
      const verification = user.verifyOTP(otp);
      if (!verification.isValid) {
        return res.status(401).json({ 
          success: false, 
          message: verification.message || "Invalid or expired OTP",
          isExpired: verification.isExpired,
          requiresOTP: true
        });
      }
      
      await user.save();
    } else {
      const newOTP = user.generateOTP();
      await user.save();
      await sendOTPEmail(email, newOTP);
      
      return res.json({ 
        success: true, 
        message: "OTP sent to your email for verification",
        requiresOTP: true,
        email: user.email
      });
    }

    const token = createToken(user._id);
    
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

// Admin/Branch Portal Login without OTP
const adminLogin = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ 
        success: false, 
        message: "Email, password, and role are required" 
      });
    }

    // Only allow login to the fixed email
    if (email !== 'frdgym@gmail.com') {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized email address" 
      });
    }

    // Admin login (no OTP)
    if (role === 'admin') {
      const isAdminPasswordValid = password === process.env.ADMIN_PASSWORD || password === 'admin123';
      if (!isAdminPasswordValid) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      }

      const token = jwt.sign(
        { 
          email,
          role: 'admin',
          timestamp: Date.now()
        }, 
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      
      return res.json({ 
        success: true, 
        token,
        user: { email, role: 'admin' }
      });
    }

    // Branch portal login (no OTP)
    if (role === 'branch') {
      // Unique passwords per branch
      const branchPasswords = {
        'branch1': 'ForeverFitness1!',
        'branch2': 'ForeverFitness2!',
        'branch3': 'ForeverFitness3!',
        'branch4': 'ForeverFitness4!',
        'branch5': 'ForeverFitness5!',
        'branch6': 'ForeverFitness6!',
        'branch7': 'ForeverFitness7!',
        'branch8': 'ForeverFitness8!',
        'branch9': 'ForeverFitness9!',
        'branch10': 'ForeverFitness10!',
        // ... add the rest up to 100 as needed
        'branch100': 'ForeverFitness100!'
      };

      let branchKey = null;
      let gymName = null;
      for (const [key, pass] of Object.entries(branchPasswords)) {
        if (password === pass) {
          branchKey = key;
          const num = key.replace('branch', '');
          gymName = `Forever Fitness Branch #${num}`;
          break;
        }
      }

      if (!branchKey || !gymName) {
        return res.status(401).json({ success: false, message: 'Invalid branch credentials' });
      }

      const token = jwt.sign(
        { 
          email,
          role: 'branch',
          gym: gymName,
          branchKey,
          timestamp: Date.now()
        }, 
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      return res.json({ 
        success: true, 
        token,
        user: { email, role: 'branch', gym: gymName }
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  } catch (error) {
    console.error('Admin/Branch login error:', error);
    res.status(500).json({ success: false, message: 'An error occurred during login' });
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

    const otp = user.generateOTP();
    await user.save();
    
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: "Password reset OTP sent successfully. Please check your email.",
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

// Verify Reset OTP
const verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and OTP are required" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email." 
      });
    }

    const verification = user.verifyOTP(otp);
    if (!verification.isValid) {
      return res.status(401).json({ 
        success: false, 
        message: verification.message || "Invalid or expired OTP",
        isExpired: verification.isExpired
      });
    }

    const resetToken = jwt.sign(
      { 
        id: user._id,
        purpose: 'password_reset'
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    await user.save();

    res.json({
      success: true,
      message: "OTP verified successfully",
      resetToken,
      email: user.email
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during verification. Please try again." 
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

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 8 characters long" 
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
  sendOTP,
  verifyOTP,
  forgotPassword,
  verifyResetOTP,
  resetPassword
};