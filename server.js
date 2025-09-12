// =================================================================
//              IMPORTS AND SETUP
// =================================================================

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const PDFDocument = require('pdfkit');
require('dotenv').config();
const cors = require('cors'); // <-- IMPORT CORS
const crypto = require('crypto'); // <-- ADDED FOR ORDER ID

const app = express();
const PORT = process.env.PORT || 3000;

// =================================================================
//              MIDDLEWARE
// =================================================================


// Allow requests from your React app's origin
app.use(cors({
    origin: 'http://localhost:5173', // <-- URL of your React app
    credentials: true // <-- Important for cookies
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Authentication middleware to protect routes using JWT from cookies
const isAuthenticated = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ message: 'Unauthorized. Please log in.' });
        }
        return res.redirect('/');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ message: 'Token is not valid.' });
        }
        res.clearCookie('token').redirect('/');
    }
};


// =================================================================
//              DATABASE CONNECTION
// =================================================================

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/washx_db')
    .then(async () => {
        console.log('✅ Successfully connected to MongoDB!');
        await seedRoles();
        await seedSocieties();
        await seedServices();
        await seedSlots();
    })
    .catch(error => console.error('❌ Error connecting to MongoDB:', error));

// =================================================================
//              MONGOOSE SCHEMAS
// =================================================================

const roleSchema = new mongoose.Schema({
    role_name: { type: String, required: true, unique: true }
});

const societySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, required: true },
    society: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Society' }],
});

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

const staffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    society: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Society' }],
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true }
}, { timestamps: true });

staffSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

const embeddedAddressSchema = new mongoose.Schema({
    address: { type: String, required: true },
    society: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    pincode: { type: String, required: true },
    isCurrent: { type: Boolean, default: false }
}, { _id: true });

const customerSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    addresses: [embeddedAddressSchema]
}, { timestamps: true });


const serviceSchema = new mongoose.Schema({
    categoryName: { type: String, required: true, unique: true },
    pricingModel: { type: String, required: true, enum: ['PerKg', 'PerItem', 'PerPair'] },
    pricePerKg: { type: Number, required: function () { return this.pricingModel === 'PerKg'; } },
    pricePerPair: { type: Number, required: function () { return this.pricingModel === 'PerPair'; } },
    subcategories: [{ itemName: { type: String, required: true }, price: { type: Number, required: true } }],
    standardTAT: { type: String, required: true },
    expressTAT: { type: String },
    expressPriceMultiplier: { type: Number, default: 1.5 },
    superfastTAT: { type: String },
    superfastPriceMultiplier: { type: Number, default: 2 }
});

const slotSchema = new mongoose.Schema({
    slotName: { type: String, required: true },
    slotType: { type: String, required: true, enum: ['Pickup', 'Delivery'] },
    maxCapacity: { type: Number, default: 5, min: 1 }
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true, index: true }, // <-- ADDED CUSTOM ORDER ID
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    deliveryAddress: { type: String, required: true },
    deliverySociety: { type: String, required: true },
    deliveryPincode: { type: String },
    orderSource: { type: String, enum: ['Call', 'Walk-in'], default: 'Call' },
    deliveryType: { type: String, enum: ['Store Pick-up', 'Home Delivery'], default: 'Home Delivery' },
    items: [{
        serviceCategoryID: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
        serviceType: { type: String, enum: ['Standard', 'Express', 'Superfast'], required: true },
        weightInKg: { type: Number, min: 0 },
        pairCount: { type: Number, min: 0 },
        pricePerKg: { type: Number },
        pricePerPair: { type: Number },
        subItems: [{
            itemName: { type: String, required: true },
            quantity: { type: Number, required: true, min: 1 },
            pricePerItem: { type: Number, required: true }
        }],
        itemTotal: { type: Number, required: true }
    }],
    billAmount: { type: Number, required: true },
    orderStatus: { type: String, enum: ['New', 'Cancelled', 'Pick-up Pending', 'In-Progress', 'Delivery Pending', 'Delivered'], default: 'New' },
    paymentStatus: { type: String, enum: ['Pending', 'Confirmed'], default: 'Pending' },
    paymentMethod: { type: String, enum: ['Cash', 'UPI'], default: 'Cash' },
    transactionID: { type: String },
    pickupDate: { type: Date },
    pickupSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot' },
    pickupAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    pickupAgentName: { type: String },
    deliveryDate: { type: Date },
    expectedDeliveryDate: { type: Date },
    deliverySlot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot' },
    deliveryAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    deliveryAgentName: { type: String }
}, { timestamps: { createdAt: 'orderedOn' } });


const User = mongoose.model('User', userSchema);
const Staff = mongoose.model('Staff', staffSchema);
const Role = mongoose.model('Role', roleSchema);
const Society = mongoose.model('Society', societySchema);
const Customer = mongoose.model('Customer', customerSchema);
const Service = mongoose.model('Service', serviceSchema);
const Order = mongoose.model('Order', orderSchema);
const Slot = mongoose.model('Slot', slotSchema);

// =================================================================
//              DATA SEEDING FUNCTIONS
// =================================================================

async function seedRoles() {
    try {
        const roles = ["Ironmen", "Delivery Agent", "Supervisor", "Washermen"];
        for (let roleName of roles) {
            if (!(await Role.findOne({ role_name: roleName }))) {
                await Role.create({ role_name: roleName });
                console.log(`✅ Role '${roleName}' added.`);
            }
        }
    } catch (error) { console.error("❌ Error seeding roles:", error); }
}

async function seedSocieties() {
    try {
        const societies = ["Riddhis Saphire", "ASBL Spire", "Asbl landmark", "Asbl Gooff"];
        for (let societyName of societies) {
            if (!(await Society.findOne({ name: societyName }))) {
                await Society.create({ name: societyName });
                console.log(`✅ Society '${societyName}' added.`);
            }
        }
    } catch (error) { console.error("❌ Error seeding societies:", error); }
}

async function seedServices() {
    try {
        const servicesData = [
            { categoryName: 'Wash & Fold', pricingModel: 'PerKg', pricePerKg: 80, standardTAT: '48 Hours', expressTAT: '36 Hours', superfastTAT: '24 Hours', expressPriceMultiplier: 1.5, superfastPriceMultiplier: 2 },
            { categoryName: 'Wash & Iron', pricingModel: 'PerKg', pricePerKg: 100, standardTAT: '48 Hours', expressTAT: '36 Hours', superfastTAT: '24 Hours', expressPriceMultiplier: 1.5, superfastPriceMultiplier: 2 },
            {
                categoryName: 'Ironing Only',
                pricingModel: 'PerItem',
                subcategories: [
                    { itemName: 'Shirt', price: 20 }, { itemName: 'T-Shirt', price: 15 },
                    { itemName: 'Pants / Trousers', price: 25 }, { itemName: 'Jeans', price: 30 },
                    { itemName: 'Others', price: 20 }
                ],
                standardTAT: '24 Hours', expressTAT: '18 Hours', superfastTAT: '12 Hours', expressPriceMultiplier: 1.5, superfastPriceMultiplier: 2
            },
            {
                categoryName: 'Dry Cleaning',
                pricingModel: 'PerItem',
                subcategories: [
                    { itemName: 'Kurta / Kurti', price: 80 }, { itemName: 'Saree (Plain)', price: 150 },
                    { itemName: 'Blazer / Coat', price: 200 }, { itemName: 'Sherwani', price: 350 },
                    { itemName: 'Lehenga', price: 400 }, { itemName: 'Others', price: 100 }
                ],
                standardTAT: '72 Hours', expressTAT: '54 Hours', superfastTAT: '36 Hours', expressPriceMultiplier: 1.5, superfastPriceMultiplier: 2
            },
            { categoryName: 'Shoes & Footwear', pricingModel: 'PerPair', pricePerPair: 120, standardTAT: '72 Hours', expressTAT: '54 Hours', superfastTAT: '36 Hours', expressPriceMultiplier: 1.5, superfastPriceMultiplier: 2 }
        ];

        for (const service of servicesData) {
            const existingService = await Service.findOne({ categoryName: service.categoryName });
            if (!existingService) {
                await Service.create(service);
                console.log(`✅ Service '${service.categoryName}' seeded.`);
            } else {
                // Optionally, update existing services if seeding logic changes
                await Service.updateOne({ _id: existingService._id }, service);
            }
        }
    } catch (error) {
        console.error("❌ Error seeding services:", error);
    }
}


async function seedSlots() {
    try {
        const count = await Slot.countDocuments();
        if (count > 0) {
            await Slot.deleteMany({ slotType: 'Delivery' });
            const allDayDeliverySlot = { slotName: '9 AM - 10 PM', slotType: 'Delivery', maxCapacity: 20 };
            if (!(await Slot.findOne(allDayDeliverySlot))) {
                await Slot.create(allDayDeliverySlot);
                console.log('✅ All-day delivery slot configured.');
            }
            return;
        };
        const slots = [
            { slotName: '9 AM - 12 PM', slotType: 'Pickup', maxCapacity: 5 },
            { slotName: '12 PM - 3 PM', slotType: 'Pickup', maxCapacity: 5 },
            { slotName: '4 PM - 7 PM', slotType: 'Pickup', maxCapacity: 5 },
            { slotName: '9 AM - 10 PM', slotType: 'Delivery', maxCapacity: 20 },
        ];
        await Slot.insertMany(slots);
        console.log('✅ Default slots seeded.');
    } catch (error) {
        console.error("❌ Error seeding slots:", error);
    }
}


// =================================================================
//              ADMIN & AUTHENTICATION ROUTES
// =================================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/home.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/customers.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'customers.html')));
app.get('/slots.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'slots.html')));
app.get('/orders.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));
app.get('/staff.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'staff.html')));
app.get('/services.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'services.html')));
app.get('/reports.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'reports.html')));


app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).send('Invalid credentials.');
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).send('Invalid credentials.');
        }
        const payload = { user: { id: user.id, email: user.email, role: user.role } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 }).redirect('/home.html');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error during login.');
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('token').redirect('/');
});


// =================================================================
//              PROTECTED API ROUTES MIDDLEWARE
// =================================================================

app.use('/api', isAuthenticated);

// =================================================================
//              HELPER FUNCTION
// =================================================================

// ADDED THIS HELPER FUNCTION FOR CUSTOM ORDER ID
async function generateOrderId() {
    while (true) {
        const code = crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();
        const orderId = `WX-${code}`;
        const existingOrder = await Order.findOne({ orderId });
        if (!existingOrder) {
            return orderId;
        }
    }
}

const calculateExpectedDelivery = async (items, startDate) => {
    if (!startDate) return null;
    let maxTatHours = 0;
    for (const item of items) {
        const serviceId = item.serviceCategoryID._id || item.serviceCategoryID;
        const service = await Service.findById(serviceId);
        if (service) {
            let tatString;
            switch(item.serviceType) {
                case 'Express':
                    tatString = service.expressTAT;
                    break;
                case 'Superfast':
                    tatString = service.superfastTAT;
                    break;
                default:
                    tatString = service.standardTAT;
            }
            const tatHours = parseInt(tatString, 10) || 0;
            if (tatHours > maxTatHours) {
                maxTatHours = tatHours;
            }
        }
    }
    if (maxTatHours > 0) {
        const deliveryDate = new Date(startDate);
        deliveryDate.setHours(deliveryDate.getHours() + maxTatHours);
        return deliveryDate;
    }
    return null;
};

// =================================================================
//              DATA MANAGEMENT ROUTES (for dropdowns, etc.)
// =================================================================

app.get('/api/roles', async (req, res) => { try { res.json(await Role.find({})); } catch (e) { res.status(500).json({ message: 'Server error' }); } });
app.get('/api/societies', async (req, res) => { try { res.json(await Society.find({})); } catch (e) { res.status(500).json({ message: 'Server error' }); } });
app.get('/api/slots', async (req, res) => { try { res.json(await Slot.find({})); } catch (e) { res.status(500).json({ message: 'Server error' }); } });

app.get('/api/slots/status', async (req, res) => {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { return res.status(400).json({ message: 'Valid date required.' }); }
    try {
        const targetDate = new Date(date);
        const startDate = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));
        const endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 1);
        
        const slots = await Slot.find({}).lean();
        
        const statusPromises = slots.map(async (slot) => {
            let countQuery;
            if (slot.slotType === 'Pickup') {
                countQuery = {
                    pickupSlot: slot._id,
                    pickupDate: { $gte: startDate, $lt: endDate }
                };
            } else {
                countQuery = {
                    "$or": [
                        { deliveryDate: { $gte: startDate, $lt: endDate } },
                        {
                            deliveryDate: { $eq: null },
                            expectedDeliveryDate: { $gte: startDate, $lt: endDate },
                            orderStatus: { $nin: ['Cancelled', 'Delivered'] }
                        }
                    ]
                };
            }
            const bookedCount = await Order.countDocuments(countQuery);
            return { ...slot, bookedCount };
        });

        res.json(await Promise.all(statusPromises));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching slot status.' });
    }
});

app.put('/api/slots/:id', async (req, res) => {
    try {
        const { maxCapacity } = req.body;
        if (typeof maxCapacity !== 'number' || maxCapacity < 1) { return res.status(400).json({ message: 'Invalid capacity.' }); }
        const updatedSlot = await Slot.findByIdAndUpdate(req.params.id, { maxCapacity }, { new: true, runValidators: true });
        if (!updatedSlot) return res.status(404).json({ message: 'Slot not found.' });
        res.json(updatedSlot);
    } catch (error) {
        res.status(500).json({ message: 'Error updating slot capacity.' });
    }
});

// =================================================================
//              STAFF MANAGEMENT ROUTES
// =================================================================

app.get('/api/staff', async (req, res) => {
    try {
        res.json(await Staff.find({}).populate('role').populate('society'));
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching staff.' });
    }
});

app.post('/api/staff', async (req, res) => {
    try {
        if (req.body.email === '') {
            delete req.body.email;
        }
        const newStaff = new Staff(req.body);
        await newStaff.save();
        const populatedStaff = await Staff.findById(newStaff._id).populate('role').populate('society');
        res.status(201).json(populatedStaff);
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0]; // Detects the field (e.g., 'phone' or 'email')
            const message = `This ${field} is already registered. Please use a different one.`;
            return res.status(400).json({ message });
        }
        res.status(500).json({ message: 'Error adding staff member.' });
    }
});

app.put('/api/staff/:id', async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) {
            return res.status(404).json({ message: 'Staff not found.' });
        }
        const updateData = req.body;
        if (updateData.email === '') {
            updateData.email = undefined;
        }
        Object.assign(staff, updateData);
        const updatedStaff = await staff.save();
        const populatedStaff = await Staff.findById(updatedStaff._id).populate('role').populate('society');
        res.json(populatedStaff);
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0]; // Detects the field
            const message = `This ${field} is already registered. Please use a different one.`;
            return res.status(400).json({ message });
        }
        res.status(500).json({ message: 'Error updating staff.' });
    }
});

app.delete('/api/staff/:id', async (req, res) => {
    try {
        const deletedStaff = await Staff.findByIdAndDelete(req.params.id);
        if (!deletedStaff) return res.status(404).json({ message: 'Staff not found.' });
        res.json({ message: 'Staff deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting staff.' });
    }
});

// ========== MODIFIED ROUTE ==========
// /api/staff/agents -> Fetches ALL staff members for dropdowns
app.get('/api/staff/agents', async (req, res) => {
    try {
        // This line fetches all staff members regardless of their role
        const agents = await Staff.find({}).populate('role');
        res.json(agents);
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching agents.' });
    }
});


// =================================================================
//              CUSTOMER MANAGEMENT ROUTES
// =================================================================

// ========== UPDATED AND REFACTORED CUSTOMER ROUTE ==========
app.get('/api/customers', async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const search = req.query.search || '';
        const sortKey = req.query.sortKey || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const skip = (page - 1) * limit;

        // 1. Build the Match Stage (for searching)
        const matchStage = {};
        if (search) {
            const regex = { $regex: search, $options: 'i' };
            // Find societies that match the search term to use their IDs
            const matchingSocieties = await Society.find({ name: regex }).select('_id');
            const societyIds = matchingSocieties.map(s => s._id);

            matchStage.$or = [
                { customerName: regex },
                { phone: regex },
                { 'addresses.pincode': regex },
                { 'addresses.society': { $in: societyIds } }
            ];
        }

        // 2. Build the Sort Stage
        const sortStage = { [sortKey]: sortOrder };
        
        // 3. Construct the Aggregation Pipeline
        const pipeline = [
            { $match: matchStage },
            // Join with Orders to calculate stats
            {
                $lookup: {
                    from: 'orders',
                    localField: '_id',
                    foreignField: 'customerID',
                    as: 'orders'
                }
            },
            // Calculate totalSpent and orderCount
            {
                $addFields: {
                    orderCount: { $size: '$orders' },
                    totalSpent: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: '$orders',
                                        as: 'order',
                                        cond: { $ne: ['$$order.orderStatus', 'Cancelled'] }
                                    }
                                },
                                as: 'order',
                                in: '$$order.billAmount'
                            }
                        }
                    }
                }
            },
            // We don't need the full orders array in the final result
            { $project: { orders: 0 } },
            // Apply sorting
            { $sort: sortStage },
            // Apply pagination using $facet to get both data and total count
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const results = await Customer.aggregate(pipeline);
        
        const customers = results[0].data;
        const totalCustomers = results[0].metadata.length > 0 ? results[0].metadata[0].total : 0;

        // Manual population for society names in addresses
        await Society.populate(customers, { path: 'addresses.society' });

        res.json({
            customers: customers,
            total: totalCustomers,
            page: page,
            hasMore: (page * limit) < totalCustomers
        });

    } catch (error) {
        console.error("Error fetching customers with stats:", error);
        res.status(500).json({ message: 'Server error fetching customers.' });
    }
});


app.get('/api/customers/:id/orders', async (req, res) => {
    try {
        const customerId = req.params.id;
        const orders = await Order.find({ customerID: customerId })
            .select('orderedOn billAmount orderStatus items deliveryAddress deliverySociety deliveryPincode')
            .populate({ path: 'items.serviceCategoryID', select: 'categoryName' })
            .sort({ orderedOn: -1 });
        if (!orders) {
            return res.json([]);
        }
        res.json(orders);
    } catch (error) {
        console.error("Error fetching customer orders:", error);
        res.status(500).json({ message: 'Server error fetching customer orders.' });
    }
});

app.post('/api/customers', async (req, res) => {
    try {
        const { customerName, phone, address, society, pincode } = req.body;
        const newCustomerData = { customerName, phone, addresses: [{ address, society, pincode, isCurrent: true }] };
        const newCustomer = new Customer(newCustomerData);
        await newCustomer.save();
        const populatedCustomer = await Customer.findById(newCustomer._id).populate('addresses.society');
        res.status(201).json(populatedCustomer);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'A customer with this phone number already exists.' });
        res.status(500).json({ message: 'Error adding new customer.' });
    }
});

app.put('/api/customers/:id', async (req, res) => {
    try {
        const { customerName, phone, address, society, pincode } = req.body;
        const customer = await Customer.findById(req.params.id);
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });
        customer.customerName = customerName;
        customer.phone = phone;
        if (customer.addresses && customer.addresses.length > 0) {
            customer.addresses[0].address = address;
            customer.addresses[0].society = society;
            customer.addresses[0].pincode = pincode;
        } else {
            customer.addresses.push({ address, society, pincode, isCurrent: true });
        }
        await customer.save();
        const populatedCustomer = await Customer.findById(customer._id).populate('addresses.society');
        res.json(populatedCustomer);
    } catch (error) {
        res.status(500).json({ message: 'Error updating customer.' });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        const deletedCustomer = await Customer.findByIdAndDelete(req.params.id);
        if (!deletedCustomer) return res.status(404).json({ message: 'Customer not found.' });
        res.json({ message: 'Customer deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting customer.' });
    }
});


// =================================================================
//              SERVICE & ORDER ROUTES
// =================================================================

app.get('/api/services', async (req, res) => {
    try {
        res.json(await Service.find({}));
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching services.' });
    }
});

app.put('/api/services/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        if (!updateData) {
            return res.status(400).json({ message: 'Invalid update data provided.' });
        }
        const updatedService = await Service.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!updatedService) {
            return res.status(404).json({ message: 'Service not found.' });
        }
        res.json(updatedService);
    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({ message: 'Error updating service.' });
    }
});


// MODIFIED FOR PAGINATION & ADVANCED FILTERING
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        // Build the match query from filters
        const matchQuery = {};

        // Detailed Filters
        if (req.query.orderStatus && req.query.orderStatus !== 'all') {
            matchQuery.orderStatus = req.query.orderStatus;
        }
        if (req.query.paymentStatus && req.query.paymentStatus !== 'all') {
            matchQuery.paymentStatus = req.query.paymentStatus;
        }
        if (req.query.startDate) {
            matchQuery.orderedOn = { ...matchQuery.orderedOn, $gte: new Date(req.query.startDate) };
        }
        if (req.query.endDate) {
            const endOfDay = new Date(req.query.endDate);
            endOfDay.setUTCHours(23, 59, 59, 999);
            matchQuery.orderedOn = { ...matchQuery.orderedOn, $lte: endOfDay };
        }

        // Quick Filters
        if (req.query.service && req.query.service !== 'all') {
            matchQuery['items.serviceType'] = req.query.service === 'express' ? 'Express' : req.query.service === 'superfast' ? 'Superfast' : 'Standard';
        }
        if (req.query.source && req.query.source !== 'all') {
            matchQuery.orderSource = req.query.source === 'walk-in' ? 'Walk-in' : 'Call';
        }

        // Search Filter (handled after lookup)
        const searchQuery = {};
        if (req.query.search) {
            const searchRegex = { $regex: req.query.search, $options: 'i' };
            // MODIFIED FOR NEW ORDER ID
            searchQuery.$or = [
                { 'customer.customerName': searchRegex },
                { 'orderId': searchRegex } 
            ];
        }

        const aggregationPipeline = [
            { $match: matchQuery },
            { $sort: { orderedOn: -1 } },
            // Lookup customer details
            {
                $lookup: {
                    from: 'customers',
                    localField: 'customerID',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
            // Apply search query after lookup
            { $match: searchQuery },
            // Facet for pagination and total count
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const results = await Order.aggregate(aggregationPipeline);
        
        const orders = results[0].data;
        const totalOrders = results[0].metadata.length > 0 ? results[0].metadata[0].total : 0;
        
        // Manual population after aggregation
        await Customer.populate(orders, { path: 'customerID', select: 'customerName phone' });
        await Slot.populate(orders, { path: 'pickupSlot', select: 'slotName' });
        
        // Replace aggregated customer field with original customerID field for consistency
        orders.forEach(order => {
            order.customerID = order.customer;
            delete order.customer;
        });

        res.json({
            orders: orders,
            total: totalOrders,
            page: page,
            hasMore: (page * limit) < totalOrders
        });

    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: 'Server error fetching orders.' });
    }
});


app.get('/api/orders/:id', async (req, res) => {
    try {
        // MODIFIED TO FIND BY CUSTOM ORDER ID
        const order = await Order.findOne({ orderId: req.params.id })
            .populate({ path: 'customerID', select: 'customerName phone' })
            .populate('items.serviceCategoryID')
            .populate('pickupSlot deliverySlot')
            .populate('pickupAgent deliveryAgent');

        if (!order) return res.status(404).json({ message: 'Order not found.' });
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching order details.' });
    }
});

// MODIFIED: Order creation logic
app.post('/api/orders', async (req, res) => {
    const { customerID, items, pickupAgent, isPickupScheduled } = req.body;
    try {
        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'Order must contain at least one item.' });
        }
        const customer = await Customer.findById(customerID).populate('addresses.society');
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });
        const currentAddress = customer.addresses.find(a => a.isCurrent) || customer.addresses[0];
        if (!currentAddress) {
            return res.status(400).json({ message: 'Customer does not have a current address set.' });
        }
        const itemGroups = items.reduce((groups, item) => {
            const type = item.serviceType;
            if (!groups[type]) { groups[type] = []; }
            groups[type].push(item);
            return groups;
        }, {});

        const createdOrders = [];
        for (const serviceType in itemGroups) {
            const groupItems = itemGroups[serviceType];
            let serverCalculatedBill = 0;
            const processedItems = [];
            for (const item of groupItems) {
                const service = await Service.findById(item.serviceCategoryID);
                if (!service) return res.status(400).json({ message: `Invalid service ID: ${item.serviceCategoryID}` });
                
                let multiplier = 1;
                if (item.serviceType === 'Express') {
                    multiplier = service.expressPriceMultiplier || 1.5;
                } else if (item.serviceType === 'Superfast') {
                    multiplier = service.superfastPriceMultiplier || 2;
                }

                let currentItemTotal = 0;
                const processedItem = { serviceCategoryID: service._id, serviceType: item.serviceType };
                switch (service.pricingModel) {
                    case 'PerKg':
                        processedItem.weightInKg = item.weightInKg;
                        processedItem.pricePerKg = item.pricePerKg || (service.pricePerKg * multiplier);
                        currentItemTotal = processedItem.weightInKg * processedItem.pricePerKg;
                        break;
                    case 'PerPair':
                        processedItem.pairCount = item.pairCount;
                        processedItem.pricePerPair = item.pricePerPair || (service.pricePerPair * multiplier);
                        currentItemTotal = processedItem.pairCount * processedItem.pricePerPair;
                        break;
                    case 'PerItem':
                        processedItem.subItems = [];
                        for (const sub of item.subItems) {
                            const serviceSubItem = service.subcategories.find(s => s.itemName === sub.itemName);
                            const pricePerItem = sub.pricePerItem || (serviceSubItem.price * multiplier);
                            currentItemTotal += sub.quantity * pricePerItem;
                            processedItem.subItems.push({ ...sub, pricePerItem });
                        }
                        break;
                }
                processedItem.itemTotal = currentItemTotal;
                processedItems.push(processedItem);
                serverCalculatedBill += currentItemTotal;
            }

            const newOrderData = {
                ...req.body,
                items: processedItems,
                billAmount: serverCalculatedBill,
                deliveryAddress: currentAddress.address,
                deliverySociety: currentAddress.society.name,
                deliveryPincode: currentAddress.pincode,
            };
            
            // MODIFIED TO ADD CUSTOM ID
            newOrderData.orderId = await generateOrderId();

            let calculationStartDate;
            if (isPickupScheduled) {
                calculationStartDate = new Date(req.body.pickupDate);
                newOrderData.orderStatus = pickupAgent ? 'Pick-up Pending' : 'New';
            } else {
                calculationStartDate = new Date();
                newOrderData.orderStatus = 'In-Progress';
                delete newOrderData.pickupDate;
                delete newOrderData.pickupSlot;
                delete newOrderData.pickupAgent;
            }

            newOrderData.expectedDeliveryDate = await calculateExpectedDelivery(processedItems, calculationStartDate);
            delete newOrderData.isPickupScheduled;

            const newOrder = new Order(newOrderData);
            await newOrder.save();
            const populatedOrder = await Order.findById(newOrder._id).populate('customerID', 'customerName').populate('items.serviceCategoryID', 'categoryName').populate('pickupSlot', 'slotName');
            createdOrders.push(populatedOrder);
        }
        res.status(201).json(createdOrders);
    } catch (error) {
        console.error(error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Error creating new order(s).' });
    }
});


app.put('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id; // This is now the custom WX-XXXXX ID
        const updateData = { ...req.body };
        // MODIFIED TO FIND BY CUSTOM ORDER ID
        const originalOrder = await Order.findOne({ orderId });
        if (!originalOrder) return res.status(404).json({ message: "Order not found." });

        // Robustly handle agent assignment and un-assignment to ensure agent name is also updated.
        if (updateData.hasOwnProperty('pickupAgent')) {
            if (updateData.pickupAgent) {
                const agent = await Staff.findById(updateData.pickupAgent);
                updateData.pickupAgentName = agent ? agent.name : null;
            } else {
                updateData.pickupAgentName = null;
            }
        }

        if (updateData.hasOwnProperty('deliveryAgent')) {
            if (updateData.deliveryAgent) {
                const agent = await Staff.findById(updateData.deliveryAgent);
                updateData.deliveryAgentName = agent ? agent.name : null;
            } else {
                updateData.deliveryAgentName = null;
            }
        }

        if (updateData.deliveryDate) {
            const allDayDeliverySlot = await Slot.findOne({ slotType: 'Delivery' });
            if (allDayDeliverySlot) {
                updateData.deliverySlot = allDayDeliverySlot._id;
            } else {
                console.warn('All-day delivery slot not found in database.');
            }
        } else {
            updateData.deliverySlot = null;
        }

        if (updateData.items) {
            let serverCalculatedBill = 0;
            const processedItems = [];
            for (const item of updateData.items) {
                const service = await Service.findById(item.serviceCategoryID);
                if (!service) return res.status(400).json({ message: `Invalid service ID: ${item.serviceCategoryID}` });
                
                let multiplier = 1;
                if (item.serviceType === 'Express') {
                    multiplier = service.expressPriceMultiplier || 1.5;
                } else if (item.serviceType === 'Superfast') {
                    multiplier = service.superfastPriceMultiplier || 2;
                }

                let currentItemTotal = 0;
                const processedItem = { serviceCategoryID: service._id, serviceType: item.serviceType };
                switch (service.pricingModel) {
                   case 'PerKg':
                        processedItem.weightInKg = item.weightInKg;
                        processedItem.pricePerKg = item.pricePerKg || (service.pricePerKg * multiplier);
                        currentItemTotal = processedItem.weightInKg * processedItem.pricePerKg;
                        break;
                    case 'PerPair':
                        processedItem.pairCount = item.pairCount;
                        processedItem.pricePerPair = item.pricePerPair || (service.pricePerPair * multiplier);
                        currentItemTotal = processedItem.pairCount * processedItem.pricePerPair;
                        break;
                    case 'PerItem':
                        processedItem.subItems = [];
                        for (const sub of item.subItems) {
                            const serviceSubItem = service.subcategories.find(s => s.itemName === sub.itemName);
                            const pricePerItem = sub.pricePerItem || (serviceSubItem.price * multiplier);
                            currentItemTotal += sub.quantity * pricePerItem;
                            processedItem.subItems.push({ ...sub, pricePerItem });
                        }
                        break;
                }
                processedItem.itemTotal = currentItemTotal;
                processedItems.push(processedItem);
                serverCalculatedBill += currentItemTotal;
            }
            updateData.items = processedItems;
            updateData.billAmount = serverCalculatedBill;
            const startDate = originalOrder.orderSource === 'Walk-in' ? originalOrder.orderedOn : (updateData.pickupDate || originalOrder.pickupDate);
            updateData.expectedDeliveryDate = await calculateExpectedDelivery(updateData.items, startDate);
        }
        delete updateData.deliveryAddress;
        delete updateData.deliverySociety;

        // MODIFIED TO FIND AND UPDATE BY CUSTOM ORDER ID
        const updatedOrder = await Order.findOneAndUpdate({ orderId }, updateData, { new: true, runValidators: true });
        const populatedOrder = await Order.findById(updatedOrder._id).populate({ path: 'customerID', select: 'customerName phone' }).populate('items.serviceCategoryID', 'categoryName pricingModel').populate('pickupSlot deliverySlot', 'slotName');
        res.json(populatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ message: 'Error updating order.' });
    }
});

// =================================================================
//              DASHBOARD & REPORTS API ROUTES
// =================================================================
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = req.query;
        let endDate, startDate;

        if (endStr) {
            const [year, month, day] = endStr.split('-').map(Number);
            endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        } else {
            endDate = new Date();
            endDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999));
        }
        if (startStr) {
            const [year, month, day] = startStr.split('-').map(Number);
            startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        } else {
            startDate = new Date(endDate);
            startDate.setUTCDate(startDate.getUTCDate() - 6);
            startDate.setUTCHours(0, 0, 0, 0);
        }

        const dateFilter = { orderedOn: { $gte: startDate, $lte: endDate } };
        const totalOrders = await Order.countDocuments(dateFilter);
        const revenueData = await Order.aggregate([{ $match: { ...dateFilter, paymentStatus: 'Confirmed' } }, { $group: { _id: null, total: { $sum: '$billAmount' } } }]);
        const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;
        const pendingRevenueData = await Order.aggregate([{ $match: { ...dateFilter, paymentStatus: 'Pending' } }, { $group: { _id: null, total: { $sum: '$billAmount' } } }]);
        const pendingRevenue = pendingRevenueData.length > 0 ? pendingRevenueData[0].total : 0;
        
        // MODIFICATION: Only count customers with non-cancelled orders as active
        const activeStatuses = ['New', 'Pick-up Pending', 'In-Progress', 'Delivery Pending' ];
        const activeCustomers = await Order.distinct('customerID', {
            ...dateFilter,
            orderStatus: { $in: activeStatuses }
        });

        const orderStatusBreakdown = await Order.aggregate([{ $match: dateFilter }, { $group: { _id: '$orderStatus', count: { $sum: 1 } } }]);
        const recentOrders = await Order.find(dateFilter).sort({ orderedOn: -1 }).limit(5).populate({ path: 'customerID', select: 'customerName' });
        res.json({ totalOrders, totalRevenue, pendingRevenue, totalActiveCustomers: activeCustomers.length, orderStatusBreakdown, recentOrders });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ message: 'Server error fetching dashboard stats.' });
    }
});

// =================================================================
//              PDF GENERATION CLASS
// =================================================================

class ManifestGenerator {
    constructor(data, reportDate, reportType) {
        this.doc = new PDFDocument({
            layout: 'landscape',
            margin: 40,
            bufferPages: true
        });
        this.data = data;
        this.reportDate = reportDate;
        this.reportType = reportType;
        this.pageNumber = 0;
    }

    generate() {
        this.doc.on('pageAdded', this._onPageAdded.bind(this));
        this._onPageAdded();
        this._generateTable();
        this._finalizeDocument();
        return this.doc;
    }

    _onPageAdded() {
        this.pageNumber++;
        const range = this.doc.page.margins;
        this._generateHeader(range);
        this._generateFooter(range);
    }

    _generateHeader(range) {
        this.doc.fontSize(10).fillColor('#555555').text('WashX Laundry Services', range.left, range.top - 20);
        const title = this.reportType === 'pickups' ? 'Pickup Manifest' : 'Delivery Manifest';
        this.doc.fontSize(20).fillColor('#000000').font('Helvetica-Bold')
            .text(title, { align: 'center' });

        const dateLabel = this.reportType === 'pickups' ? 'Pickup Date' : 'Delivery Date';
        this.doc.fontSize(10).font('Helvetica')
           .text(`Total Tasks: ${this.data.length}`, range.left, range.top)
           .text(`${dateLabel}: ${this.reportDate}`, range.left, range.top, { align: 'right' });
    }
    
    _generateFooter(range) {
        const timestamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        this.doc.fontSize(8).fillColor('#555555')
            .text(`Generated on: ${timestamp}`, range.left, range.bottom + 10, { align: 'left' })
            .text(`Page ${this.pageNumber}`, range.left, range.bottom + 10, { align: 'right' });
    }
    
    _getTableHeadersAndWidths() {
        if (this.reportType === 'pickups') {
            return {
                headers: ['S.No.', 'Order ID', 'Customer', 'Address & Pincode', 'Contact', 'Slot', 'Items', 'Assigned Agent', 'Notes / Remarks'],
                colWidths: [30, 65, 90, 120, 70, 75, 120, 80, 100]
            };
        } else {
            return {
                headers: ['S.No.', 'Order ID', 'Customer', 'Address & Pincode', 'Contact', 'Amount Due', 'Items', 'Assigned Agent', 'Notes / Remarks'],
                colWidths: [30, 65, 90, 120, 70, 60, 120, 80, 115]
            };
        }
    }

    _generateTable() {
        const { headers, colWidths } = this._getTableHeadersAndWidths();
        const tableTop = this.doc.page.margins.top + 50;
        this.doc.y = tableTop;
        const startX = this.doc.page.margins.left;

        this.doc.font('Helvetica-Bold').fontSize(8);
        this._drawTableRow(startX, this.doc.y, headers, colWidths, true);
        this.doc.y += 20;
        this.doc.font('Helvetica').fontSize(8);

        const entriesPerPage = 10;

        this.data.forEach((order, index) => {
            if (index > 0 && index % entriesPerPage === 0) {
                this.doc.addPage();
                const newTableTop = this.doc.page.margins.top + 50;
                this.doc.y = newTableTop;
                this.doc.font('Helvetica-Bold').fontSize(8);
                this._drawTableRow(startX, this.doc.y, headers, colWidths, true);
                this.doc.y += 20;
                this.doc.font('Helvetica').fontSize(8);
            }
            
            // MODIFIED TO USE NEW ORDER ID
            const orderIdText = `${order.orderId}\n(${order.orderSource || 'Call'})`;
            const customerText = order.customerID?.customerName || 'DELETED CUSTOMER';
            const addressText = `${order.deliveryAddress}, ${order.deliverySociety}, ${order.deliveryPincode || ''}`;
            const contactText = order.customerID?.phone || 'N/A';
            const itemsText = order.items.map(item => {
                const categoryName = item.serviceCategoryID?.categoryName || 'Unknown Service';
                let desc = `${categoryName} (${item.serviceType.charAt(0)})`;
                if (item.weightInKg) desc += ` ${item.weightInKg}kg`;
                if (item.pairCount) desc += ` ${item.pairCount}p`;
                if (item.subItems && item.subItems.length > 0) {
                    const subDesc = item.subItems.map(si => `${si.quantity}x${si.itemName}`).join(', ');
                    desc += ` [${subDesc}]`;
                }
                return desc;
            }).join('; ');
            const agentText = this.reportType === 'pickups' ? (order.pickupAgentName || 'Unassigned') : (order.deliveryAgentName || 'Unassigned');

            let rowData;
            if (this.reportType === 'pickups') {
                const slotText = order.pickupSlot?.slotName || 'N/A';
                rowData = [(index + 1).toString(), orderIdText, customerText, addressText, contactText, slotText, itemsText, agentText, ''];
            } else {
                const amountDue = `₹ ${order.paymentStatus === 'Pending' ? order.billAmount.toFixed(2) : '0.00'}`;
                rowData = [(index + 1).toString(), orderIdText, customerText, addressText, contactText, amountDue, itemsText, agentText, ''];
            }
            
            let maxHeight = 0;
            rowData.forEach((text, i) => {
                const cellHeight = this.doc.heightOfString(text.toString(), { width: colWidths[i] - 10 });
                if (cellHeight > maxHeight) maxHeight = cellHeight;
            });
            const rowHeight = Math.max(maxHeight + 10, 25);
            
            this._drawTableRow(startX, this.doc.y, rowData, colWidths, false, index % 2 !== 0, rowHeight);
            this.doc.y += rowHeight;
        });
    }

    _drawTableRow(x, y, rowData, colWidths, isHeader, isZebra, rowHeight) {
        let currentX = x;
        const totalWidth = colWidths.reduce((a, b) => a + b, 0);

        if (isHeader) {
            this.doc.rect(x, y, totalWidth, 20).fill('#EAEAEA').stroke('#CCCCCC');
            this.doc.fillColor('#000000');
        } else if (isZebra) {
            this.doc.rect(x, y, totalWidth, rowHeight).fill('#F9F9F9').stroke('#EAEAEA');
            this.doc.fillColor('#333333');
        } else {
            this.doc.rect(x, y, totalWidth, rowHeight).stroke('#EAEAEA');
            this.doc.fillColor('#333333');
        }

        rowData.forEach((cellData, i) => {
            this.doc.text(cellData.toString(), currentX + 5, y + 5, {
                width: colWidths[i] - 10,
                align: 'left'
            });
            currentX += colWidths[i];
        });
    }
    
    _finalizeDocument() {
        this.doc.end();
    }
}

// =================================================================
//              PDF MANIFEST GENERATION ROUTES
// =================================================================

const handleManifestRequest = async (req, res, type) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'A valid date is required.' });
    }

    try {
        const targetDate = new Date(date);
        const startDate = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));
        const endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 1);

        let query = {};
        if (type === 'pickups') {
            query = { 
                pickupDate: { $gte: startDate, $lt: endDate }
            };
        } else { // deliveries
            query = { 
                deliveryDate: { $gte: startDate, $lt: endDate },
            };
        }

        const orders = await Order.find(query)
            .populate('customerID', 'customerName phone')
            .populate('items.serviceCategoryID', 'categoryName')
            .populate('pickupSlot', 'slotName')
            .sort({ orderedOn: 1 });

        if (orders.length === 0) {
            return res.status(404).json({ message: `No scheduled ${type} found for ${date}.` });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${type}_manifest_${date}.pdf`);

        const generator = new ManifestGenerator(orders, date, type);
        const pdfDoc = generator.generate();
        pdfDoc.pipe(res);

    } catch (error) {
        console.error(`Error fetching ${type} report:`, error);
        res.status(500).json({ message: 'Failed to generate manifest PDF.' });
    }
};

app.get('/api/reports/pickups', (req, res) => {
    handleManifestRequest(req, res, 'pickups');
});

app.get('/api/reports/deliveries', (req, res) => {
    handleManifestRequest(req, res, 'deliveries');
});


// =================================================================
//              START THE SERVER
// =================================================================
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});