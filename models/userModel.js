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
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
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

<<<<<<< Updated upstream
const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export default UserModel;
=======
// Admin seeding function
userSchema.statics.ensureAdminExists = async function() {
  try {
    const adminEmail = 'frdgym@gmail.com';
    const adminPassword = 'Admin@123!!';
    
    // Check if user with admin email exists
    const existingUser = await this.findOne({ email: adminEmail });
    
    if (existingUser) {
      // Update user to admin role and reset password to default
      let updated = false;
      
      if (existingUser.role !== 'admin') {
        existingUser.role = 'admin';
        updated = true;
      }
      
      if (!existingUser.isVerified) {
        existingUser.isVerified = true;
        updated = true;
      }
      
      // Always reset password to ensure it's the default admin password
      existingUser.password = adminPassword;
      updated = true;
      
      if (updated) {
        await existingUser.save();
        console.log('Admin user updated with role and password reset');
      } else {
        console.log('Admin user already exists and up to date');
      }
      
      return existingUser;
    } else {
      // Create new admin user
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
    }
  } catch (error) {
    console.error('Error ensuring admin exists:', error);
    throw error;
  }
};

const UserModel = mongoose.models.User || mongoose.model('User ', userSchema); // Use singular 'User '
export default UserModel;
>>>>>>> Stashed changes
