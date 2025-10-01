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
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isAdmin: { type: Boolean, default: false },
  cartData: { type: Object, default: {} },
  isVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  otpSentAt: { type: Date, default: null }
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

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export default UserModel;