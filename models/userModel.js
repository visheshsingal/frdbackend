import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import validator from "validator";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    validate: {
      validator: function(v) {
        return validator.isEmail(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  password: { type: String, required: true, minlength: 8 },
  cartData: { type: Object, default: {} },
  isVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  otpSentAt: { type: Date, default: null },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { 
  minimize: false,
  timestamps: true 
});

// Pre-save password hash
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP
userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  this.otpSentAt = new Date();
  return otp;
};

// Verify OTP
userSchema.methods.verifyOTP = function(enteredOtp) {
  if (!this.otp || !this.otpExpiry) {
    return { isValid: false, message: "OTP not set or expired", isExpired: true };
  }
  
  const isExpired = this.otpExpiry < Date.now();
  if (isExpired) {
    return { isValid: false, message: "OTP has expired", isExpired: true };
  }

  const isValid = this.otp === enteredOtp;
  if (isValid) {
    this.isVerified = true;
    this.otp = null;
    this.otpExpiry = null;
  }
  
  return { isValid, message: isValid ? "OTP verified successfully" : "Invalid OTP" };
};

// Admin seeding function
userSchema.statics.ensureAdminExists = async function() {
  try {
    const adminEmail = 'frdgym@gmail.com';
    const adminPassword = 'Admin@123!!';
    
    // First check if an admin already exists
    const existingAdmin = await this.findOne({ email: adminEmail, role: 'admin' });
    
    if (existingAdmin) {
      console.log('Admin user already exists');
      return existingAdmin;
    }
    
    // Check if user with admin email exists but isn't admin
    const existingUser = await this.findOne({ email: adminEmail });
    
    if (existingUser) {
      // Update existing user to admin role
      existingUser.role = 'admin';
      existingUser.password = adminPassword;
      existingUser.isVerified = true;
      
      await existingUser.save();
      console.log('Existing user upgraded to admin role');
      return existingUser;
    }
    
    // Create new admin user only if none exists
    try {
      const adminUser = new this({
        name: 'FRD Gym Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        isVerified: true
      });
      
      await adminUser.save();
      console.log('Admin user created successfully');
      return adminUser;
    } catch (createError) {
      // If creation fails due to duplicate key, try to find existing user again
      if (createError.code === 11000) {
        console.log('Duplicate key error, checking for existing user again...');
        const existingUserRetry = await this.findOne({ email: adminEmail });
        if (existingUserRetry) {
          if (existingUserRetry.role !== 'admin') {
            existingUserRetry.role = 'admin';
            existingUserRetry.password = adminPassword;
            existingUserRetry.isVerified = true;
            await existingUserRetry.save();
            console.log('Updated existing user to admin after duplicate error');
          }
          return existingUserRetry;
        }
      }
      throw createError;
    }
  } catch (error) {
    console.error('Error ensuring admin exists:', error);
    // Don't throw error in production to prevent app crash
    if (process.env.NODE_ENV === 'production') {
      console.log('Continuing without admin seeding due to error in production');
      return null;
    }
    throw error;
  }
};

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export default UserModel;