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

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
})

// COMMON ORDER CREATION FUNCTION
const createOrder = async (orderData) => {
    // Validate items
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

        // Validate required fields
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
            payment: false,
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

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod: "Stripe",
            payment: false,
            date: Date.now(),
            status: 'Order Placed'
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

        // Add delivery charge
        line_items.push({
            price_data: {
                currency: 'inr',
                product_data: {
                    name: 'Delivery Charges'
                },
                unit_amount: 10 * 100 // ₹10 delivery
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

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod: "Razorpay",
            payment: false,
            date: Date.now(),
            status: 'Order Placed'
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

// Verify Stripe 
const verifyStripe = async (req, res) => {
    const { orderId, success, userId } = req.body;

    try {
        if (success === "true") {
            await orderModel.findByIdAndUpdate(orderId, { payment: true });
            await userModel.findByIdAndUpdate(userId, { cartData: {} });
            res.json({ 
                success: true, 
                message: "Payment Successful! Your order has been confirmed." 
            });
        } else {
            await orderModel.findByIdAndDelete(orderId);
            res.json({ 
                success: false, 
                message: "Payment failed. Please try again." 
            });
        }
    } catch (error) {
        console.log('Stripe Verify Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
        });
    }
}

// Verify Razorpay
const verifyRazorpay = async (req, res) => {
    try {
        const { userId, razorpay_order_id } = req.body;

        const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);
        if (orderInfo.status === 'paid') {
            await orderModel.findByIdAndUpdate(orderInfo.receipt, { payment: true });
            await userModel.findByIdAndUpdate(userId, { cartData: {} });
            res.json({ 
                success: true, 
                message: "Payment Successful! Your order has been confirmed." 
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Payment Failed. Please try again.' 
            });
        }
    } catch (error) {
        console.log('Razorpay Verify Error:', error);
        res.json({ 
            success: false, 
            message: error.message 
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

// Update order status from Admin Panel
const updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        if (!orderId || !status) {
            return res.json({ 
                success: false, 
                message: "Order ID and status are required" 
            });
        }

        await orderModel.findByIdAndUpdate(orderId, { status });
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

// Cancel order and send email notification
const cancelOrder = async (req, res) => {
    try {
        const { orderId, userEmail } = req.body;

        const order = await orderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        if (order.status === 'Cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: 'Order is already cancelled' 
            });
        }

        if (order.status === 'Delivered') {
            return res.status(400).json({ 
                success: false, 
                message: 'Delivered orders cannot be cancelled' 
            });
        }

        order.status = 'Cancelled';
        await order.save();

        // Send cancellation email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: userEmail || order.address.email,
            subject: `Order #${order._id} Cancelled`,
            html: `
                <h2>Order Cancellation Confirmation</h2>
                <p>Your order #${order._id} has been cancelled.</p>
                <p><strong>Order Details:</strong></p>
                <ul>
                    ${order.items.map(item => `
                        <li>${item.name} x ${item.quantity} - ₹${item.price}</li>
                    `).join('')}
                </ul>
                <p>Total Amount: ₹${order.amount}</p>
                <p>Contact: +91 9278160000</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ 
            success: true, 
            message: 'Order cancelled successfully' 
        });
    } catch (error) {
        console.error('Cancel Order Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error cancelling order' 
        });
    }
}

export {
    verifyRazorpay, verifyStripe, placeOrder, placeOrderStripe,
    placeOrderRazorpay, allOrders, userOrders, updateStatus, cancelOrder
}