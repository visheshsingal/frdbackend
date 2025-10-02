import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Stripe from 'stripe'
import razorpay from 'razorpay'
import nodemailer from 'nodemailer'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const razorpayInstance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
})

// ✅ IMPROVED EMAIL TRANSPORTER WITH BETTER CONFIG
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // ✅ ADD THESE SETTINGS FOR BETTER RELIABILITY
    pool: true,
    maxConnections: 1,
    maxMessages: 5,
    rateDelta: 1000,
    rateLimit: 5
})

// COMMON ORDER CREATION FUNCTION
const createOrder = async (orderData) => {
    if (!orderData.items || orderData.items.length === 0) {
        throw new Error("Cannot place order with empty cart");
    }

    const newOrder = new orderModel(orderData);
    await newOrder.save();
    return newOrder;
}

// Placing orders using COD Method
const placeOrder = async (req, res) => {
    try {
        const { userId, items, amount, address } = req.body;

        if (!items || items.length === 0) {
            return res.json({ 
                success: false, 
                message: "Your cart is empty. Please add items before placing order." 
            });
        }

        if (!userId || !amount || !address) {
            return res.json({ 
                success: false, 
                message: "Missing required order information" 
            });
        }

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod: "COD",
            payment: false, // COD starts as unpaid
            date: Date.now(),
            status: 'Order Placed'
        }

        const newOrder = await createOrder(orderData);
        await userModel.findByIdAndUpdate(userId, { cartData: {} });

        res.json({ 
            success: true, 
            message: "Order Placed Successfully",
            orderId: newOrder._id 
        });

    } catch (error) {
        console.log('COD Order Error:', error);
        res.json({ 
            success: false, 
            message: error.message || "Failed to place order" 
        });
    }
}

// Placing orders using Stripe Method
const placeOrderStripe = async (req, res) => {
    try {
        const { userId, items, amount, address } = req.body;
        const { origin } = req.headers;

        if (!items || items.length === 0) {
            return res.json({ 
                success: false, 
                message: "Your cart is empty" 
            });
        }

        // Create temporary order with pending payment
        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod: "Stripe",
            payment: false, // Initially false
            date: Date.now(),
            status: 'Payment Pending'
        }

        const newOrder = await createOrder(orderData);

        const line_items = items.map((item) => ({
            price_data: {
                currency: 'inr',
                product_data: {
                    name: item.name,
                    images: item.image ? [item.image] : []
                },
                unit_amount: Math.round(item.price * 100)
            },
            quantity: item.quantity
        }))

        line_items.push({
            price_data: {
                currency: 'inr',
                product_data: {
                    name: 'Delivery Charges'
                },
                unit_amount: 10 * 100
            },
            quantity: 1
        })

        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url: `${origin}/verify?success=false&orderId=${newOrder._id}`,
            line_items,
            mode: 'payment',
        })

        res.json({ 
            success: true, 
            session_url: session.url,
            orderId: newOrder._id 
        });

    } catch (error) {
        console.log('Stripe Order Error:', error);
        res.json({ 
            success: false, 
            message: error.message || "Payment failed" 
        });
    }
}

// Verify Stripe - ONLY SUCCESSFUL PAYMENTS CREATE ORDERS
const verifyStripe = async (req, res) => {
    const { orderId, success, userId } = req.body;

    try {
        if (success === "true") {
            // Payment successful - update order to paid
            await orderModel.findByIdAndUpdate(orderId, { 
                payment: true,
                status: 'Order Placed'
            });
            await userModel.findByIdAndUpdate(userId, { cartData: {} });
            res.json({ 
                success: true, 
                message: "Payment Successful! Your order has been confirmed." 
            });
        } else {
            // Payment failed - delete the temporary order
            await orderModel.findByIdAndDelete(orderId);
            res.json({ 
                success: false, 
                message: "Payment failed. Order cancelled." 
            });
        }
    } catch (error) {
        console.log('Stripe Verify Error:', error);
        // Error case - delete the order
        try {
            await orderModel.findByIdAndDelete(orderId);
        } catch (deleteError) {
            console.log('Delete order error:', deleteError);
        }
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// Placing orders using Razorpay Method
const placeOrderRazorpay = async (req, res) => {
    try {
        const { userId, items, amount, address } = req.body;

        if (!items || items.length === 0) {
            return res.json({ 
                success: false, 
                message: "Your cart is empty" 
            });
        }

        // Create temporary order with pending payment
        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod: "Razorpay",
            payment: false, // Initially false
            date: Date.now(),
            status: 'Payment Pending'
        }

        const newOrder = await createOrder(orderData);

        const options = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: newOrder._id.toString()
        }

        const razorpayOrder = await razorpayInstance.orders.create(options);
        
        res.json({ 
            success: true, 
            order: razorpayOrder,
            orderId: newOrder._id 
        });

    } catch (error) {
        console.log('Razorpay Order Error:', error);
        res.json({ 
            success: false, 
            message: error.message || "Payment failed" 
        });
    }
}

// Verify Razorpay - ONLY SUCCESSFUL PAYMENTS CONFIRM ORDERS
const verifyRazorpay = async (req, res) => {
    try {
        const { userId, razorpay_order_id } = req.body;

        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);
        
        if (orderInfo.status === 'paid') {
            // Payment successful - update order to paid and confirmed
            await orderModel.findByIdAndUpdate(orderInfo.receipt, { 
                payment: true,
                status: 'Order Placed'
            });
            await userModel.findByIdAndUpdate(userId, { cartData: {} });
            
            res.json({ 
                success: true, 
                message: "Payment Successful! Your order has been confirmed." 
            });
        } else {
            // Payment failed - delete the temporary order
            await orderModel.findByIdAndDelete(orderInfo.receipt);
            res.json({ 
                success: false, 
                message: 'Payment Failed. Order cancelled.' 
            });
        }
    } catch (error) {
        console.log('Razorpay Verify Error:', error);
        // Error case - delete the order
        try {
            await orderModel.findByIdAndDelete(orderInfo.receipt);
        } catch (deleteError) {
            console.log('Delete order error:', deleteError);
        }
        res.json({ 
            success: false, 
            message: 'Payment verification failed. Order cancelled.' 
        });
    }
}

// All Orders data for Admin Panel
const allOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({}).sort({ date: -1 });
        res.json({ 
            success: true, 
            orders,
            message: `Found ${orders.length} orders` 
        });
    } catch (error) {
        console.log('All Orders Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// User Order Data For Frontend
const userOrders = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.json({ 
                success: false, 
                message: "User ID is required" 
            });
        }

        const orders = await orderModel.find({ userId }).sort({ date: -1 });
        res.json({ 
            success: true, 
            orders,
            message: `Found ${orders.length} orders for user` 
        });

    } catch (error) {
        console.log('User Orders Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// Update order status from Admin Panel - DELIVERED = AUTOMATIC PAID
const updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        if (!orderId || !status) {
            return res.json({ 
                success: false, 
                message: "Order ID and status are required" 
            });
        }

        const updateData = { status };
        
        // If status is 'Delivered', automatically mark as paid
        if (status === 'Delivered') {
            updateData.payment = true;
        }

        await orderModel.findByIdAndUpdate(orderId, updateData);
        
        res.json({ 
            success: true, 
            message: `Order status updated to ${status}` 
        });

    } catch (error) {
        console.log('Update Status Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// Update admin notes for order
const updateNotes = async (req, res) => {
    try {
        const { orderId, adminNotes } = req.body;

        if (!orderId) {
            return res.json({ 
                success: false, 
                message: "Order ID is required" 
            });
        }

        await orderModel.findByIdAndUpdate(orderId, { adminNotes });
        
        res.json({ 
            success: true, 
            message: "Notes updated successfully" 
        });

    } catch (error) {
        console.log('Update Notes Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// Update tracking URL for order
const updateTrackingUrl = async (req, res) => {
    try {
        const { orderId, trackingUrl } = req.body;

        if (!orderId) {
            return res.json({ 
                success: false, 
                message: "Order ID is required" 
            });
        }

        await orderModel.findByIdAndUpdate(orderId, { trackingUrl });
        
        res.json({ 
            success: true, 
            message: "Tracking URL updated successfully" 
        });

    } catch (error) {
        console.log('Update Tracking URL Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// Update user notes for order
const updateUserNotes = async (req, res) => {
    try {
        const { orderId, userNotes } = req.body;

        if (!orderId) {
            return res.json({ 
                success: false, 
                message: "Order ID is required" 
            });
        }

        await orderModel.findByIdAndUpdate(orderId, { userNotes });
        
        res.json({ 
            success: true, 
            message: "Special request updated successfully" 
        });

    } catch (error) {
        console.log('Update User Notes Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// ✅ IMPROVED CANCEL ORDER WITH BETTER EMAIL HANDLING
const cancelOrder = async (req, res) => {
    try {
        const { orderId, userEmail } = req.body;

        console.log('🔍 Cancel Order Request Received:', { orderId, userEmail });

        // Find the order
        const order = await orderModel.findById(orderId);
        if (!order) {
            console.log('❌ Order not found:', orderId);
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        // Check if order is already cancelled
        if (order.status === 'Cancelled') {
            console.log('⚠️ Order already cancelled:', orderId);
            return res.status(400).json({ 
                success: false, 
                message: 'Order is already cancelled' 
            });
        }

        // Check if order is already delivered
        if (order.status === 'Delivered') {
            console.log('❌ Cannot cancel delivered order:', orderId);
            return res.status(400).json({ 
                success: false, 
                message: 'Delivered orders cannot be cancelled' 
            });
        }

        // Update order status
        order.status = 'Cancelled';
        await order.save();

        console.log('✅ Order cancelled in database:', orderId);

        // ✅ IMPROVED EMAIL SENDING WITH PROPER ERROR HANDLING
        let emailSent = false;
        let emailError = null;

        try {
            const targetEmail = userEmail || order.address.email;
            console.log('📧 Attempting to send cancellation email to:', targetEmail);

            const mailOptions = {
                from: `"Fitness Store" <${process.env.EMAIL_USER}>`,
                to: targetEmail,
                subject: `Order #${order._id} Cancellation Confirmation`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                        <div style="text-align: center; background: #052659; color: white; padding: 15px; border-radius: 10px 10px 0 0;">
                            <h2 style="margin: 0;">Order Cancellation Confirmation</h2>
                        </div>
                        <div style="padding: 20px;">
                            <p>Dear ${order.address.firstName} ${order.address.lastName},</p>
                            <p>Your order <strong>#${order._id}</strong> has been successfully cancelled.</p>
                            
                            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                                <h3 style="color: #052659; margin-top: 0;">Order Details:</h3>
                                <ul style="list-style: none; padding: 0;">
                                    ${order.items.map(item => `
                                        <li style="padding: 5px 0; border-bottom: 1px solid #eee;">
                                            <strong>${item.name}</strong> 
                                            <br>Quantity: ${item.quantity} 
                                            | Price: ₹${item.price}
                                            ${item.size ? ` | Size: ${item.size}` : ''}
                                        </li>
                                    `).join('')}
                                </ul>
                                <div style="margin-top: 10px; padding-top: 10px; border-top: 2px solid #052659;">
                                    <strong>Total Amount: ₹${order.amount}</strong>
                                </div>
                            </div>

                            <p>If you have any questions or need assistance, please don't hesitate to contact us:</p>
                            <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                                <p style="margin: 5px 0;">📞 Phone: +91 9278160000</p>
                                <p style="margin: 5px 0;">✉️ Email: ${process.env.EMAIL_USER}</p>
                            </div>

                            <p>Thank you for shopping with us. We hope to serve you better in the future.</p>
                            
                            <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                                <p style="color: #666; font-size: 12px;">
                                    This is an automated message. Please do not reply to this email.
                                </p>
                            </div>
                        </div>
                    </div>
                `
            };

            // ✅ ADD TIMEOUT TO EMAIL SENDING
            const emailPromise = transporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Email timeout')), 10000)
            );

            await Promise.race([emailPromise, timeoutPromise]);
            
            emailSent = true;
            console.log('✅ Cancellation email sent successfully to:', targetEmail);

        } catch (emailError) {
            console.log('⚠️ Email sending failed, but order was cancelled:', emailError.message);
            emailError = emailError.message;
            // Don't throw error - order is still cancelled successfully
        }

        res.json({ 
            success: true, 
            message: 'Order cancelled successfully' + (emailSent ? ' and email sent' : ' (email failed)'),
            emailSent: emailSent,
            emailError: emailError
        });

    } catch (error) {
        console.error('💥 Cancel Order Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error cancelling order: ' + error.message 
        });
    }
}

export {
    verifyRazorpay, verifyStripe, placeOrder, placeOrderStripe,
    placeOrderRazorpay, allOrders, userOrders, updateStatus, cancelOrder, updateNotes, updateUserNotes, updateTrackingUrl
}