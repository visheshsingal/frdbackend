import validator from "validator";
import jwt from 'jsonwebtoken';
import UserModel from "../models/userModel.js";

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

// Helper: Create JWT token
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { 
    expiresIn: '1d',
    algorithm: 'HS256'
  });
};

// Initialize Admin User (Run this once to create admin user)
const initializeAdmin = async () => {
  try {
    const adminEmail = 'frdgym@gmail.com';
    const adminExists = await UserModel.findOne({ email: adminEmail, role: 'admin' });
    
    if (!adminExists) {
      const adminUser = new UserModel({
        name: 'FRD Admin',
        email: adminEmail,
        password: process.env.ADMIN_PASSWORD || 'Admin@123!!',
        role: 'admin',
        isVerified: true
      });
      await adminUser.save();
      console.log('Admin user created successfully');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// Call this function when server starts
initializeAdmin();

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

    // Enhanced password validation
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
      isVerified: true,
      role: 'user'
    });

    await newUser.save();

    const token = createToken(newUser._id);
    
    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        name: newUser.name,
        email: newUser.email,
        isVerified: newUser.isVerified,
        role: newUser.role
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

    const token = createToken(user._id);
    
    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        role: user.role
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

// Admin Login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    // Find admin user in database
    const adminUser = await UserModel.findOne({ email, role: 'admin' });
    
    if (!adminUser) {
      return res.status(401).json({ 
        success: false, 
<<<<<<< Updated upstream
        message: "Admin account not found" 
      });
    }

    // Verify password using bcrypt
=======
        message: "Invalid admin credentials" 
      });
    }

    // Verify password
>>>>>>> Stashed changes
    const isPasswordValid = await adminUser.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid admin credentials" 
      });
    }

    const token = jwt.sign(
      { 
        id: adminUser._id,
        email: adminUser.email,
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
<<<<<<< Updated upstream
        email: adminUser.email, 
        role: 'admin',
        name: adminUser.name
=======
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email, 
        role: 'admin' 
>>>>>>> Stashed changes
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'An error occurred during login' });
  }
};

// Change Admin Credentials
const changeAdminCredentials = async (req, res) => {
  try {
    const { currentPassword, newEmail, newPassword } = req.body;

    // Validate current password is required
    if (!currentPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Current password is required" 
      });
    }

    // At least one of newEmail or newPassword must be provided
    if (!newEmail && !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Either new email or new password must be provided" 
      });
    }

    // Get current admin user from token (set by middleware)
    const adminUser = await UserModel.findById(req.user.id);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: "Access denied" 
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await adminUser.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Validate new email if provided
    if (newEmail && !validator.isEmail(newEmail)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    // Validate new password if provided
    if (newPassword) {
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        let errorMessage = "Password must contain:";
        if (!passwordValidation.minLength) errorMessage += " at least 8 characters,";
        if (!passwordValidation.hasUpperCase) errorMessage += " one uppercase letter,";
        if (!passwordValidation.hasLowerCase) errorMessage += " one lowercase letter,";
        if (!passwordValidation.hasTwoSpecialChars) errorMessage += " at least two special characters,";
        
        // Remove trailing comma and add period
        errorMessage = errorMessage.slice(0, -1) + '.';
        return res.status(400).json({ 
          success: false, 
          message: errorMessage
        });
      }
    }

    // Check if new email already exists (excluding current admin)
    if (newEmail && newEmail !== adminUser.email) {
      const existingUser = await UserModel.findOne({ email: newEmail });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: "Email address already in use" 
        });
      }
    }

    // Update credentials
    if (newEmail) {
      adminUser.email = newEmail;
    }
    if (newPassword) {
      adminUser.password = newPassword; // Will be hashed by pre-save middleware
    }

    await adminUser.save();

    res.json({
      success: true,
      message: "Admin credentials updated successfully",
      user: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    console.error('Change credentials error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while updating credentials. Please try again." 
    });
  }
};

// Legacy function for backward compatibility
const changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const email = req.user.email;

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Current password, new password, and confirmation are required" 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "New passwords do not match" 
      });
    }

<<<<<<< Updated upstream
    // Enhanced password validation for admin
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

    // Find admin user
    const adminUser = await UserModel.findOne({ email, role: 'admin' });
    if (!adminUser) {
      return res.status(404).json({ 
        success: false, 
        message: "Admin account not found" 
      });
    }

    // Verify current password using bcrypt
    const isCurrentPasswordValid = await adminUser.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Update password in database
    adminUser.password = newPassword;
    await adminUser.save();

    res.json({
      success: true,
      message: "Admin password changed successfully"
    });
=======
    // Call the new function with appropriate parameters
    req.body = { currentPassword, newPassword };
    return changeAdminCredentials(req, res);
>>>>>>> Stashed changes
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while changing password. Please try again." 
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
  changeAdminPassword,
  changeAdminCredentials
};