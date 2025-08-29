// =================================================================
//                      IMPORTS AND SETUP
// =================================================================

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =================================================================
//                          MIDDLEWARE
// =================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
//                      DATABASE CONNECTION
// =================================================================

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Successfully connected to MongoDB Atlas!');
        await seedRoles();
        await seedSocieties();
        await seedServices(); // Seed initial services
    })
    .catch(error => console.error('❌ Error connecting to MongoDB Atlas:', error));

// =================================================================
//                         MONGOOSE SCHEMAS
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

const staffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    society: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Society' }],
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true }
}, { timestamps: true });

const customerSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    address: { type: String }, // e.g., Flat number, block
    society: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Society',
        required: true
    }
}, { timestamps: true });

const serviceSchema = new mongoose.Schema({
    serviceName: { type: String, required: true },
    standardTAT: { type: String, required: true },
    standardPrice: { type: Number, required: true },
    expressTAT: { type: String },
    expressPrice: { type: Number },
    unitType: {
        type: String,
        required: true,
        enum: ['Piece', 'Pair', 'Kg']
    }
});

const orderSchema = new mongoose.Schema({
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderSource: { type: String, enum: ['WhatsApp', 'Call', 'Walk-in'], default: 'Call' },
    orderType: { type: String, enum: ['Standard', 'Express'], default: 'Standard' },
    deliveryType: { type: String, enum: ['Store Pick-up', 'Home Delivery'], default: 'Home Delivery' },
    items: [{
        serviceID: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
        quantity: { type: Number, required: true, min: 1 },
        basePrice: { type: Number, required: true }
    }],
    billAmount: { type: Number, required: true },
    orderStatus: {
        type: String,
        enum: ['New', 'Cancelled', 'Pick-up Pending', 'In-Progress', 'Delivery Pending', 'Delivered', 'Collection Pending', 'Collected'],
        default: 'New'
    },
    paymentStatus: { type: String, enum: ['Pending', 'Confirmed'], default: 'Pending' },
    paymentMethod: { type: String, enum: ['Cash', 'Credit-Card', 'Debit-Card', 'UPI'], default: 'Cash' },
    transactionID: { type: String }
}, { timestamps: { createdAt: 'orderedOn' } });


const User = mongoose.model('User', userSchema);
const Staff = mongoose.model('Staff', staffSchema);
const Role = mongoose.model('Role', roleSchema);
const Society = mongoose.model('Society', societySchema);
const Customer = mongoose.model('Customer', customerSchema);
const Service = mongoose.model('Service', serviceSchema);
const Order = mongoose.model('Order', orderSchema);

// =================================================================
//                 DATA SEEDING FUNCTIONS
// =================================================================
async function seedRoles() {
    try {
        const roles = ["Pickup Agent", "Delivery Agent", "Staff"];
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
        const societies = ["Greenwood Estates", "Skyline Towers", "Oceanview Apartments", "Hillside Community"];
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
        if (await Service.countDocuments() > 0) return;
        const services = [
            { serviceName: 'T-Shirt Wash & Iron', standardTAT: '48 Hours', standardPrice: 25, expressTAT: '24 Hours', expressPrice: 40, unitType: 'Piece'},
            { serviceName: 'Jeans Wash & Iron', standardTAT: '48 Hours', standardPrice: 40, expressTAT: '24 Hours', expressPrice: 60, unitType: 'Piece'},
            { serviceName: 'Shirt Wash & Iron', standardTAT: '48 Hours', standardPrice: 30, expressTAT: '24 Hours', expressPrice: 50, unitType: 'Piece'},
            { serviceName: 'Saree Dry Clean', standardTAT: '72 Hours', standardPrice: 150, expressTAT: '36 Hours', expressPrice: 250, unitType: 'Piece'},
            { serviceName: 'Bulk Wash (per Kg)', standardTAT: '48 Hours', standardPrice: 80, unitType: 'Kg'}
        ];
        await Service.insertMany(services);
        console.log('✅ Default services seeded.');
    } catch (error) {
         console.error("❌ Error seeding services:", error);
    }
}


// =================================================================
//            ADMIN & SUPERVISOR ROUTES
// =================================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/signup', async (req, res) => {
    try {
        const { email, password, phone, society, role } = req.body;
        if (await User.findOne({ email })) return res.status(400).send('A user with this email already exists.');
        const newUser = new User({ email, password, phone, society, role });
        await newUser.save();
        res.redirect('/login.html');
    } catch (error) {
        res.status(500).send('Server error during signup.');
    }
});

app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user || req.body.password !== user.password) {
            return res.status(400).send('Invalid credentials.');
        }
        res.redirect('/home.html');
    } catch (error) {
        res.status(500).send('Server error during login.');
    }
});

// =================================================================
//            DATA MANAGEMENT ROUTES (ROLES & SOCIETIES)
// =================================================================

app.get('/api/roles', async (req, res) => {
    try { res.json(await Role.find({})); }
    catch (error) { res.status(500).json({ message: 'Server error while fetching roles.' }); }
});

app.get('/api/societies', async (req, res) => {
    try { res.json(await Society.find({})); }
    catch (error) { res.status(500).json({ message: 'Server error while fetching societies.' }); }
});

// =================================================================
//            STAFF MANAGEMENT ROUTES
// =================================================================
// GET all staff
app.get('/api/staff', async (req, res) => {
    try { res.json(await Staff.find({}).populate('role').populate('society')); }
    catch (error) { res.status(500).json({ message: 'Server error fetching staff.' }); }
});
// POST new staff
app.post('/api/staff', async (req, res) => {
    try {
        const newStaff = new Staff(req.body);
        await newStaff.save();
        const populatedStaff = await Staff.findById(newStaff._id).populate('role').populate('society');
        res.status(201).json(populatedStaff);
    } catch (error) { res.status(500).json({ message: 'Error adding staff member.' }); }
});
// UPDATE staff
app.put('/api/staff/:id', async (req, res) => {
    try {
        const updatedStaff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('role').populate('society');
        if (!updatedStaff) return res.status(404).json({ message: 'Staff not found.' });
        res.json(updatedStaff);
    } catch (error) { res.status(500).json({ message: 'Error updating staff.' }); }
});
// DELETE staff
app.delete('/api/staff/:id', async (req, res) => {
    try {
        const deletedStaff = await Staff.findByIdAndDelete(req.params.id);
        if (!deletedStaff) return res.status(404).json({ message: 'Staff not found.' });
        res.json({ message: 'Staff deleted successfully.' });
    } catch (error) { res.status(500).json({ message: 'Error deleting staff.' }); }
});

// =================================================================
//                      CUSTOMER MANAGEMENT ROUTES
// =================================================================
// GET all customers
app.get('/api/customers', async (req, res) => {
    try { res.json(await Customer.find({}).populate('society')); }
    catch (error) { res.status(500).json({ message: 'Server error fetching customers.' }); }
});
// POST new customer
app.post('/api/customers', async (req, res) => {
    try {
        const newCustomer = new Customer(req.body);
        await newCustomer.save();
        const populatedCustomer = await Customer.findById(newCustomer._id).populate('society');
        res.status(201).json(populatedCustomer);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'A customer with this phone number already exists.' });
        res.status(500).json({ message: 'Error adding new customer.' });
    }
});
// UPDATE customer
app.put('/api/customers/:id', async (req, res) => {
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('society');
        if (!updatedCustomer) return res.status(404).json({ message: 'Customer not found.' });
        res.json(updatedCustomer);
    } catch (error) { res.status(500).json({ message: 'Error updating customer.' }); }
});
// DELETE customer
app.delete('/api/customers/:id', async (req, res) => {
    try {
        const deletedCustomer = await Customer.findByIdAndDelete(req.params.id);
        if (!deletedCustomer) return res.status(404).json({ message: 'Customer not found.' });
        res.json({ message: 'Customer deleted successfully.' });
    } catch (error) { res.status(500).json({ message: 'Error deleting customer.' }); }
});


// =================================================================
//                 SERVICE & ORDER ROUTES
// =================================================================

// GET all services
// =================================================================
//                 SERVICE & ORDER ROUTES
// =================================================================

// GET all services
app.get('/api/services', async (req, res) => {
    try {
        res.json(await Service.find({}));
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching services.' });
    }
});

// GET all orders (Enhanced to populate customer's society)
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find({})
            .populate({
                path: 'customerID',
                select: 'customerName society', // Specify fields to populate
                populate: {
                    path: 'society',
                    model: 'Society',
                    select: 'name' // Only get the society name
                }
            })
            .populate('items.serviceID', 'serviceName') // Keep this for item details
            .sort({ orderedOn: -1 }); // Sort by newest first
        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: 'Server error fetching orders.' });
    }
});


// GET a single order by ID (Fully populated for details view)
app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate({
                path: 'customerID',
                populate: {
                    path: 'society',
                    model: 'Society'
                }
            })
            .populate('items.serviceID');

        if (!order) {
            return res.status(404).json({ message: 'Order not found.' });
        }
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching order details.' });
    }
});


// POST a new order
app.post('/api/orders', async (req, res) => {
    try {
        if (!req.body.items || req.body.items.length === 0) {
            return res.status(400).json({ message: 'Order must contain at least one item.' });
        }
        const newOrder = new Order(req.body);
        await newOrder.save();
        const populatedOrder = await Order.findById(newOrder._id).populate('customerID');
        res.status(201).json(populatedOrder);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating new order.' });
    }
});

// PUT - Update an existing order (NEW)
app.put('/api/orders/:id', async (req, res) => {
    try {
        const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedOrder) {
            return res.status(404).json({ message: 'Order not found.' });
        }
        // Fetch the fully populated order to send back to the client
        const populatedOrder = await Order.findById(updatedOrder._id)
             .populate({
                path: 'customerID',
                select: 'customerName society',
                populate: { path: 'society', model: 'Society', select: 'name' }
            })
            .populate('items.serviceID', 'serviceName');

        res.json(populatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ message: 'Error updating order.' });
    }
});

// =================================================================
//                        START THE SERVER
// =================================================================
app.listen(PORT, () => console.log(`🚀 Server is running on http://localhost:${PORT}`));