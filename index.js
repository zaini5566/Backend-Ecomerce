const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
require('dotenv').config();

// Environment variables
const port = process.env.PORT || 4000;
const dbUri = process.env.DB_URI;

// Middleware
app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("Successfully connected to MongoDB");
}).catch((err) => {
    console.error("Error connecting to MongoDB:", err.message);
    process.exit(1); // Exit process if unable to connect
});

// Image storage engine
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Serve images statically
app.use('/images', express.static('upload/images'));

// API routes

// Home route
app.get("/", (req, res) => {
    res.send("Express app is running");
});

// Upload image route
app.post("/upload", upload.single('product'), (req, res) => {
    res.json({
        success: 1,
        image_url: `http://localhost:${port}/images/${req.file.filename}`
    });
});

// Mongoose Schemas

// Product schema
const ProductSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    new_price: {
        type: Number,
        required: true,
    },
    old_price: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    available: {
        type: Boolean,
        default: true,
    },
});
const Product = mongoose.model("Product", ProductSchema);

// Add product route
app.post('/addproduct', async (req, res) => {
    try {
        let products = await Product.find({});
        let id = products.length > 0 ? products[products.length - 1].id + 1 : 1;

        const product = new Product({
            id: id,
            name: req.body.name,
            image: req.body.image,
            category: req.body.category,
            new_price: req.body.new_price,
            old_price: req.body.old_price
        });

        await product.save();
        res.json({ success: true, product });
    } catch (error) {
        console.error("Error adding product:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Remove product route
app.post('/removeproduct', async (req, res) => {
    try {
        await Product.findOneAndDelete({ id: req.body.id });
        res.json({ success: true });
    } catch (error) {
        console.error("Error removing product:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get all products route
app.get('/allproducts', async (req, res) => {
    try {
        let products = await Product.find({});
        res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// User schema
const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    cartData: {
        type: Map,
        of: Number,
    },
    date: {
        type: Date,
        default: Date.now,
    }
});
const User = mongoose.model('User', UserSchema);

// Signup route
app.post('/signup', async (req, res) => {
    try {
        let check = await User.findOne({ email: req.body.email });
        if (check) {
            return res.status(400).json({ success: false, errors: "Existing user found with email address" });
        }

        let cart = new Map();
        for (let i = 0; i < 300; i++) {
            cart.set(i, 0);
        }

        const user = new User({
            name: req.body.username,
            email: req.body.email,
            password: req.body.password, // Note: Consider hashing the password
            cartData: cart,
        });

        await user.save();

        const token = jwt.sign({ id: user.id }, 'secret_ecom');
        res.json({ success: true, token });
    } catch (error) {
        console.error("Error during signup:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Login route
app.post('/login', async (req, res) => {
    try {
        let user = await User.findOne({ email: req.body.email });
        if (user) {
            const passCompare = req.body.password === user.password; // Note: Consider using bcrypt for password comparison
            if (passCompare) {
                const token = jwt.sign({ id: user.id }, 'secret_ecom');
                res.json({ success: true, token });
            } else {
                res.status(400).json({ success: false, errors: "Wrong Password" });
            }
        } else {
            res.status(400).json({ success: false, errors: "Wrong Email id" });
        }
    } catch (error) {
        console.error("Error during login:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Middleware to fetch user
const fetchUser = (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) {
        return res.status(401).send({ errors: "Please authenticate using a valid token" });
    }
    try {
        const data = jwt.verify(token, 'secret_ecom');
        req.user = data;
        next();
    } catch (error) {
        res.status(401).send({ errors: "Please authenticate using a valid token" });
    }
};

// Add to cart route
app.post('/addtocart', fetchUser, async (req, res) => {
    try {
        let userData = await User.findById(req.user.id);
        userData.cartData.set(req.body.itemId, (userData.cartData.get(req.body.itemId) || 0) + 1);
        await userData.save();
        res.send("Added");
    } catch (error) {
        console.error("Error adding to cart:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Remove from cart route
app.post('/removefromcart', fetchUser, async (req, res) => {
    try {
        let userData = await User.findById(req.user.id);
        let currentQuantity = userData.cartData.get(req.body.itemId);
        if (currentQuantity > 0) {
            userData.cartData.set(req.body.itemId, currentQuantity - 1);
            await userData.save();
            res.send("Removed");
        } else {
            res.status(400).json({ success: false, errors: "Item not in cart" });
        }
    } catch (error) {
        console.error("Error removing from cart:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get cart data route
app.post('/getcart', fetchUser, async (req, res) => {
    try {
        let userData = await User.findById(req.user.id);
        res.json(userData.cartData);
    } catch (error) {
        console.error("Error fetching cart data:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Order schema
const OrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    products: [{
        id: { type: Number, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        image: { type: String, required: true },
    }],
    deliveryInfo: {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        email: { type: String, required: true },
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true },
        phone: { type: String, required: true }
    },
    totalAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    status: { type: String, default: "Processing" }
});
const Order = mongoose.model('Order', OrderSchema);

// Place order route
app.post('/placeorder', fetchUser, async (req, res) => {
    const { products, totalAmount, deliveryInfo } = req.body;

    try {
        const newOrder = new Order({
            userId: req.user.id,
            products,
            deliveryInfo,
            totalAmount
        });

        await newOrder.save();
        res.json({ success: true, order: newOrder });
    } catch (error) {
        console.error('Error placing order:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get my orders route
app.get('/myorders', fetchUser, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ date: -1 });
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get all orders route
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().populate('userId', 'name email');
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Update order status route
app.post('/updateOrderStatus', async (req, res) => {
    const { orderId, newStatus } = req.body;

    try {
        const order = await Order.findByIdAndUpdate(orderId, { status: newStatus }, { new: true });
        if (!order) {
            return res.status(404).json({ success: false, errors: "Order not found" });
        }
        res.json({ success: true, order });
    } catch (error) {
        console.error('Error updating order status:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
