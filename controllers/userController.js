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
    await user.save(); // Save the user with the new OTP and timestamp
    
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: "OTP sent successfully. Please check your email.",
      email: email // Return email for verification step
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

    // Clear OTP after successful verification
    await user.save(); // Save the user after clearing OTP fields
    
    // If this was a temp user during registration flow
    if (user.isTemp) {
      return res.json({ 
        success: true, 
        message: "OTP verified. Please complete your registration.",
        requiresRegistration: true,
        email: user.email
      });
    }

    // Generate token for immediate login
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

// Enhanced registration flow
const registerUser  = async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;

    // Validation
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

    // Check if user exists
    let user = await UserModel.findOne({ email });

    // Existing user flow
    if (user) {
      if (!user.isTemp && user.password) {
        return res.status(409).json({ 
          success: false, 
          message: "An account already exists with this email. Please login instead." 
        });
      }

      // Handle OTP verification for temp users
      if (otp) {
        const verification = user.verifyOTP(otp);
        if (!verification.isValid) {
          return res.status(401).json({ 
            success: false, 
            message: verification.message || "Invalid or expired OTP",
            isExpired: verification.isExpired
          });
        }
        
        // Convert temp user to permanent
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
        // Send new OTP for existing temp user
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

    // New user registration
    const newUser  = new UserModel({ 
      name, 
      email, 
      password,
      isVerified: false
    });

    const newOTP = newUser .generateOTP();
    await newUser .save();
    await sendOTPEmail(email, newOTP);

    res.status(200).json({ 
      success: true, 
      message: "OTP sent to your email for verification",
      requiresOTP: true,
      email: newUser .email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during registration. Please try again." 
    });
  }
};

// Improved login with OTP fallback
const loginUser  = async (req, res) => {
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

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Incorrect email or password",
        requiresOTP: false
      });
    }

    // Handle OTP verification if provided
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
      
      // Clear OTP after successful verification
      await user.save();
    } else {
      // If no OTP provided, require OTP verification
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

    // Generate token for successful login
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

// Secure admin login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign(
        { 
          email: process.env.ADMIN_EMAIL,
          role: 'admin',
          timestamp: Date.now()
        }, 
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      
      return res.json({ 
        success: true, 
        token,
        user: {
          email: process.env.ADMIN_EMAIL,
          role: 'admin'
        }
      });
    }

    res.status(401).json({ 
      success: false, 
      message: "Invalid admin credentials" 
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during admin login" 
    });
  }
};

export {
  loginUser ,
  registerUser ,
  adminLogin,
  sendOTP,
  verifyOTP
};
