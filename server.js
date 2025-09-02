// =================================================================
//                      IMPORTS AND SETUP
// =================================================================

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =================================================================
//                          MIDDLEWARE
// =================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET ,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/washx_db'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // Session expires in 1 day
    }
}));

// Authentication middleware to protect routes
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next(); // User is logged in, proceed
    }
    // If it's an API request, send a 401 Unauthorized status
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ message: 'Unauthorized. Please log in.' });
    }
    // For page requests, redirect to the login page
    res.redirect('/');
};


// =================================================================
//                      DATABASE CONNECTION
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

// An embedded schema for addresses to support multiple addresses per customer
const embeddedAddressSchema = new mongoose.Schema({
    address: { type: String, required: true }, // e.g., "Flat 101, Block A"
    society: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    isCurrent: { type: Boolean, default: false }
}, { _id: true }); // Give each address a unique ID

const customerSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    addresses: [embeddedAddressSchema] // Replaces the old 'address' and 'society' fields
}, { timestamps: true });


const serviceSchema = new mongoose.Schema({
    categoryName: {
        type: String,
        required: true,
        unique: true
    },
    pricingModel: {
        type: String,
        required: true,
        enum: ['PerKg', 'PerItem', 'PerPair']
    },
    pricePerKg: {
        type: Number,
        required: function() { return this.pricingModel === 'PerKg'; }
    },
    pricePerPair: {
        type: Number,
        required: function() { return this.pricingModel === 'PerPair'; }
    },
    subcategories: [{
        itemName: { type: String, required: true },
        price: { type: Number, required: true }
    }],
    standardTAT: { type: String, required: true },
    expressTAT: { type: String },
    expressPriceMultiplier: { type: Number, default: 2 }
});

const slotSchema = new mongoose.Schema({
    slotName: { type: String, required: true },
    slotType: { type: String, required: true, enum: ['Pickup', 'Delivery'] },
    maxCapacity: { type: Number, default: 5, min: 1 }
});

const orderSchema = new mongoose.Schema({
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },

    // Address snapshot fields to ensure historical order data is immutable
    deliveryAddress: { type: String, required: true },
    deliverySociety: { type: String, required: true },

    orderSource: { type: String, enum: ['Call', 'Walk-in'], default: 'Call' },
    deliveryType: { type: String, enum: ['Store Pick-up', 'Home Delivery'], default: 'Home Delivery' },
    items: [{
        serviceCategoryID: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
        serviceType: { type: String, enum: ['Standard', 'Express'], required: true },
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
    orderStatus: {
        type: String,
        enum: ['New', 'Cancelled', 'Pick-up Pending', 'In-Progress', 'Delivery Pending', 'Delivered'],
        default: 'New'
    },
    paymentStatus: { type: String, enum: ['Pending', 'Confirmed'], default: 'Pending' },
    paymentMethod: { type: String, enum: ['Cash', 'Credit-Card', 'Debit-Card', 'UPI'], default: 'Cash' },
    transactionID: { type: String },
    pickupDate: { type: Date, required: true },
    pickupSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    pickupAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    pickupAgentName: { type: String },
    deliveryDate: { type: Date },
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
        const societies = ["ASBL Springs", "ASBL Spire", "Asbl landmark", "Asbl Gooff", "Others"];
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
            { categoryName: 'Wash & Fold', pricingModel: 'PerKg', pricePerKg: 80, standardTAT: '48 Hours', expressTAT: '24 Hours', expressPriceMultiplier: 2 },
            { categoryName: 'Wash & Iron', pricingModel: 'PerKg', pricePerKg: 100, standardTAT: '48 Hours', expressTAT: '24 Hours', expressPriceMultiplier: 2 },
            {
                categoryName: 'Ironing Only',
                pricingModel: 'PerItem',
                subcategories: [
                    { itemName: 'Shirt', price: 20 },
                    { itemName: 'T-Shirt', price: 15 },
                    { itemName: 'Pants / Trousers', price: 25 },
                    { itemName: 'Jeans', price: 30 },
                    { itemName: 'Others', price: 20 }
                ],
                standardTAT: '24 Hours',
                expressTAT: '12 Hours',
                expressPriceMultiplier: 2
            },
            {
                categoryName: 'Dry Cleaning',
                pricingModel: 'PerItem',
                subcategories: [
                    { itemName: 'Kurta / Kurti', price: 80 },
                    { itemName: 'Saree (Plain)', price: 150 },
                    { itemName: 'Blazer / Coat', price: 200 },
                    { itemName: 'Sherwani', price: 350 },
                    { itemName: 'Lehenga', price: 400 },
                    { itemName: 'Others', price: 100 }
                ],
                standardTAT: '72 Hours',
                expressTAT: '36 Hours',
                expressPriceMultiplier: 2
            },
            { categoryName: 'Shoes & Footwear', pricingModel: 'PerPair', pricePerPair: 120, standardTAT: '72 Hours', expressTAT: '36 Hours', expressPriceMultiplier: 2 }
        ];

        for (const service of servicesData) {
            const existingService = await Service.findOne({ categoryName: service.categoryName });

            if (!existingService) {
                await Service.create(service);
                console.log(`✅ Service '${service.categoryName}' seeded.`);
            } else {
                let needsUpdate = false;
                if (!existingService.expressTAT || !existingService.expressPriceMultiplier) {
                    existingService.expressTAT = service.expressTAT;
                    existingService.expressPriceMultiplier = service.expressPriceMultiplier;
                    needsUpdate = true;
                }
                 if (service.pricingModel === 'PerItem') {
                    const hasOthers = existingService.subcategories.some(sub => sub.itemName === 'Others');
                    if (!hasOthers) {
                        const othersSubCategory = service.subcategories.find(sub => sub.itemName === 'Others');
                        if (othersSubCategory) {
                           existingService.subcategories.push(othersSubCategory);
                           needsUpdate = true;
                        }
                    }
                }
                if (needsUpdate) {
                    await existingService.save();
                    console.log(`🔄 Service '${service.categoryName}' updated.`);
                }
            }
        }
        console.log('✅ Service seeding/verification complete.');
    } catch (error) {
        console.error("❌ Error seeding services:", error);
    }
}


async function seedSlots() {
    try {
        if (await Slot.countDocuments() > 0) return;
        const slots = [
            { slotName: '9 AM - 12 PM', slotType: 'Pickup', maxCapacity: 5 },
            { slotName: '12 PM - 3 PM', slotType: 'Pickup', maxCapacity: 5 },
            { slotName: '4 PM - 7 PM', slotType: 'Pickup', maxCapacity: 5 },
            { slotName: '9 AM - 12 PM', slotType: 'Delivery', maxCapacity: 5 },
            { slotName: '12 PM - 3 PM', slotType: 'Delivery', maxCapacity: 5 },
            { slotName: '4 PM - 7 PM', slotType: 'Delivery', maxCapacity: 5 },
        ];
        await Slot.insertMany(slots);
        console.log('✅ Default slots seeded.');
    } catch (error) {
        console.error("❌ Error seeding slots:", error);
    }
}


// =================================================================
//            ADMIN & AUTHENTICATION ROUTES
// =================================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/home.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/customers.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'customers.html')));
app.get('/slots.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'slots.html')));
app.get('/orders.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));
app.get('/staff.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'staff.html')));
app.get('/services.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'services.html')));


app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user || req.body.password !== user.password) {
            return res.status(401).send('Invalid credentials.');
        }

        req.session.user = {
            id: user._id,
            email: user.email,
            role: user.role
        };

        res.redirect('/home.html');
    } catch (error) {
        res.status(500).send('Server error during login.');
    }
});



app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/');
    });
});


// =================================================================
//            PROTECTED API ROUTES MIDDLEWARE
// =================================================================

app.use('/api', isAuthenticated);


// =================================================================
//            DATA MANAGEMENT ROUTES (for dropdowns, etc.)
// =================================================================

app.get('/api/roles', async (req, res) => {
    try {
        res.json(await Role.find({}));
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching roles.' });
    }
});

app.get('/api/societies', async (req, res) => {
    try {
        res.json(await Society.find({}));
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching societies.' });
    }
});

app.get('/api/slots', async (req, res) => {
    try {
        res.json(await Slot.find({}));
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching slots.' });
    }
});

app.get('/api/slots/status', async (req, res) => {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'A valid date in YYYY-MM-DD format is required.' });
    }

    try {
        const targetDate = new Date(date);
        const startDate = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));
        const endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 1);

        const slots = await Slot.find({}).lean();

        const statusPromises = slots.map(async (slot) => {
            let countQuery;
            if (slot.slotType === 'Pickup') {
                countQuery = Order.countDocuments({
                    pickupSlot: slot._id,
                    pickupDate: { $gte: startDate, $lt: endDate }
                });
            } else { // Delivery
                countQuery = Order.countDocuments({
                    deliverySlot: slot._id,
                    deliveryDate: { $gte: startDate, $lt: endDate }
                });
            }
            const bookedCount = await countQuery;
            return { ...slot, bookedCount };
        });

        const slotsWithStatus = await Promise.all(statusPromises);
        res.json(slotsWithStatus);

    } catch (error) {
        console.error("Error fetching slot status:", error);
        res.status(500).json({ message: 'Error fetching slot status.' });
    }
});

app.put('/api/slots/:id', async (req, res) => {
    try {
        const { maxCapacity } = req.body;
        if (typeof maxCapacity !== 'number' || maxCapacity < 1) {
            return res.status(400).json({ message: 'Invalid capacity value. Must be a number greater than 0.' });
        }
        const updatedSlot = await Slot.findByIdAndUpdate(
            req.params.id,
            { maxCapacity },
            { new: true, runValidators: true }
        );
        if (!updatedSlot) return res.status(404).json({ message: 'Slot not found.' });
        res.json(updatedSlot);
    } catch (error) {
        res.status(500).json({ message: 'Error updating slot capacity.' });
    }
});


// =================================================================
//            STAFF MANAGEMENT ROUTES
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
        const newStaff = new Staff(req.body);
        await newStaff.save();
        const populatedStaff = await Staff.findById(newStaff._id).populate('role').populate('society');
        res.status(201).json(populatedStaff);
    } catch (error) {
        res.status(500).json({ message: 'Error adding staff member.' });
    }
});

app.put('/api/staff/:id', async (req, res) => {
    try {
        const updatedStaff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('role').populate('society');
        if (!updatedStaff) return res.status(404).json({ message: 'Staff not found.' });
        res.json(updatedStaff);
    } catch (error) {
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

app.get('/api/staff/agents', async (req, res) => {
    try {
        const agentRoles = await Role.find({ role_name: { $in: ['Pickup Agent', 'Delivery Agent'] } });
        const agentRoleIds = agentRoles.map(role => role._id);
        const agents = await Staff.find({ role: { $in: agentRoleIds } }).populate('role');
        res.json(agents);
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching agents.' });
    }
});


// =================================================================
//                      CUSTOMER MANAGEMENT ROUTES
// =================================================================

app.get('/api/customers', async (req, res) => {
    try {
        const orderStats = await Order.aggregate([
            {
                $group: {
                    _id: '$customerID',
                    orderCount: { $sum: 1 },
                    totalSpent: { $sum: '$billAmount' }
                }
            }
        ]);

        const statsMap = orderStats.reduce((acc, stat) => {
            acc[stat._id.toString()] = {
                orderCount: stat.orderCount,
                totalSpent: stat.totalSpent
            };
            return acc;
        }, {});

        // Populate society within the addresses array
        const customers = await Customer.find({}).populate('addresses.society').lean();

        const customersWithStats = customers.map(customer => {
            const stats = statsMap[customer._id.toString()];
            // Find the current address to display in the main list
            const currentAddress = customer.addresses?.find(a => a.isCurrent) || customer.addresses?.[0];
            return {
                ...customer,
                // Add top-level fields for easy access on the frontend list
                currentAddress: currentAddress ? currentAddress.address : 'N/A',
                currentSociety: currentAddress ? currentAddress.society : { name: 'N/A' },
                orderCount: stats ? stats.orderCount : 0,
                totalSpent: stats ? stats.totalSpent : 0
            };
        });

        res.json(customersWithStats);

    } catch (error) {
        console.error("Error fetching customers with stats:", error);
        res.status(500).json({ message: 'Server error fetching customers.' });
    }
});

app.get('/api/customers/:id/orders', async (req, res) => {
    try {
        const customerId = req.params.id;
        const orders = await Order.find({ customerID: customerId })
            .select('orderedOn billAmount orderStatus items')
            .populate({
                path: 'items.serviceCategoryID',
                select: 'categoryName'
             })
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
        const { customerName, phone, address, society } = req.body;

        // Create a new customer with their first address set as current
        const newCustomerData = {
            customerName,
            phone,
            addresses: [{
                address,
                society,
                isCurrent: true
            }]
        };

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
        const { customerName, phone, address, society } = req.body;
        const customer = await Customer.findById(req.params.id);
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });

        customer.customerName = customerName;
        customer.phone = phone;

        // This is a simplified update. A full implementation would manage the whole array.
        // Here, we update the first address, assuming it's the one being edited.
        if (customer.addresses && customer.addresses.length > 0) {
            customer.addresses[0].address = address;
            customer.addresses[0].society = society;
        } else {
            // If no address exists, add one
            customer.addresses.push({ address, society, isCurrent: true });
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
//                 SERVICE & ORDER ROUTES
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


app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find({})
            .populate({
                path: 'customerID',
                select: 'customerName phone', // Address is now in the order, so we only need basic info
            })
            .populate('items.serviceCategoryID', 'categoryName pricingModel')
            .populate('pickupSlot deliverySlot', 'slotName')
            .sort({ orderedOn: -1 });
        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: 'Server error fetching orders.' });
    }
});

app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate({
                path: 'customerID',
                select: 'customerName phone' // Only need basic customer info
            })
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

app.post('/api/orders', async (req, res) => {
    // Contains common info like customerID, pickupDate, agent, etc.
    const { customerID, items, pickupDate, pickupSlot, pickupAgent } = req.body;

    try {
        // === 1. Initial Validations (Unchanged) ===
        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'Order must contain at least one item.' });
        }
        // Slot capacity check
        const slot = await Slot.findById(pickupSlot);
        if (!slot) return res.status(400).json({ message: 'Invalid pickup slot selected.' });
        const targetDate = new Date(pickupDate);
        const startDate = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));
        const endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 1);
        const pickupCount = await Order.countDocuments({
            pickupSlot: pickupSlot,
            pickupDate: { $gte: startDate, $lt: endDate }
        });
        if (pickupCount >= slot.maxCapacity) {
            return res.status(400).json({ message: `Pickup slot for this date is full. Please choose another.` });
        }
        // Address snapshot logic
        const customer = await Customer.findById(customerID).populate('addresses.society');
        if (!customer) return res.status(404).json({ message: 'Customer not found.' });
        const currentAddress = customer.addresses.find(a => a.isCurrent) || customer.addresses[0];
        if (!currentAddress) {
            return res.status(400).json({ message: 'Customer does not have a current address set.' });
        }

        // === 2. Group Items by Service Type (New Logic) ===
        const itemGroups = items.reduce((groups, item) => {
            const type = item.serviceType; // 'Standard' or 'Express'
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(item);
            return groups;
        }, {});

        const createdOrders = [];

        // === 3. Loop Through Groups and Create an Order for Each ===
        for (const serviceType in itemGroups) {
            const groupItems = itemGroups[serviceType];
            
            // --- Re-usable Price Calculation & Validation Logic ---
            let serverCalculatedBill = 0;
            const processedItems = [];
            for (const item of groupItems) {
                const service = await Service.findById(item.serviceCategoryID);
                if (!service) return res.status(400).json({ message: `Invalid service ID: ${item.serviceCategoryID}` });

                const isExpress = item.serviceType === 'Express';
                const multiplier = isExpress ? (service.expressPriceMultiplier || 2) : 1;
                let currentItemTotal = 0;
                const processedItem = { serviceCategoryID: service._id, serviceType: item.serviceType };

                switch (service.pricingModel) {
                    case 'PerKg':
                        if(!item.weightInKg || item.weightInKg <= 0) return res.status(400).json({message: 'Weight is required for PerKg items.'});
                        const pricePerKg = item.pricePerKg || (service.pricePerKg * multiplier);
                        currentItemTotal = item.weightInKg * pricePerKg;
                        processedItem.weightInKg = item.weightInKg;
                        processedItem.pricePerKg = pricePerKg;
                        break;
                    case 'PerPair':
                         if(!item.pairCount || item.pairCount <= 0) return res.status(400).json({message: 'Pair count is required for PerPair items.'});
                        const pricePerPair = item.pricePerPair || (service.pricePerPair * multiplier);
                        currentItemTotal = item.pairCount * pricePerPair;
                        processedItem.pairCount = item.pairCount;
                        processedItem.pricePerPair = pricePerPair;
                        break;
                    case 'PerItem':
                        if(!item.subItems || item.subItems.length === 0) return res.status(400).json({message: 'Sub-items are required for PerItem services.'});
                        processedItem.subItems = [];
                        for (const sub of item.subItems) {
                            const serviceSubItem = service.subcategories.find(s => s.itemName === sub.itemName);
                            if (!serviceSubItem) return res.status(400).json({ message: `Invalid sub-item: ${sub.itemName}`});
                            const pricePerItem = sub.pricePerItem || (serviceSubItem.price * multiplier);
                            currentItemTotal += sub.quantity * pricePerItem;
                            processedItem.subItems.push({ itemName: sub.itemName, quantity: sub.quantity, pricePerItem });
                        }
                        break;
                    default: return res.status(400).json({ message: 'Unknown pricing model.' });
                }
                processedItem.itemTotal = currentItemTotal;
                processedItems.push(processedItem);
                serverCalculatedBill += currentItemTotal;
            }
            // --- End of Price Logic ---

            // --- Create the Order Document ---
            const newOrderData = {
                ...req.body, // Contains common info like customerID, pickupDate, etc.
                items: processedItems,
                billAmount: serverCalculatedBill,
                deliveryAddress: currentAddress.address,
                deliverySociety: currentAddress.society.name,
            };

            if (pickupAgent) {
                const agent = await Staff.findById(pickupAgent);
                if (agent) {
                    newOrderData.pickupAgentName = agent.name;
                    newOrderData.orderStatus = 'Pick-up Pending';
                }
            } else {
                newOrderData.orderStatus = 'New';
            }

            const newOrder = new Order(newOrderData);
            await newOrder.save();
            const populatedOrder = await Order.findById(newOrder._id)
                .populate('customerID', 'customerName')
                .populate('items.serviceCategoryID', 'categoryName')
                .populate('pickupSlot', 'slotName');
            
            createdOrders.push(populatedOrder);
        }

        // === 4. Send Array of Created Orders as Response ===
        res.status(201).json(createdOrders);

    } catch (error) {
        console.error(error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Error creating new order(s).' });
    }
});


app.put('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const updateData = { ...req.body };

        if (updateData.pickupAgent) {
            const agent = await Staff.findById(updateData.pickupAgent);
            if(agent) updateData.pickupAgentName = agent.name;
            else {
               updateData.pickupAgentName = null;
            }
        }

        if (updateData.deliveryAgent) {
            const agent = await Staff.findById(updateData.deliveryAgent);
            if(agent) updateData.deliveryAgentName = agent.name;
            else {
               updateData.deliveryAgentName = null;
            }
        }

        // Prevent address from being updated on an existing order
        delete updateData.deliveryAddress;
        delete updateData.deliverySociety;

        const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true, runValidators: true });
        if (!updatedOrder) return res.status(404).json({ message: 'Order not found.' });

        const populatedOrder = await Order.findById(updatedOrder._id)
             .populate({
                path: 'customerID',
                select: 'customerName phone',
            })
            .populate('items.serviceCategoryID', 'categoryName pricingModel')
            .populate('pickupSlot deliverySlot', 'slotName');

        res.json(populatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ message: 'Error updating order.' });
    }
});

// =================================================================
//                 DASHBOARD API ROUTE
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

        const revenueData = await Order.aggregate([
            { $match: { ...dateFilter, paymentStatus: 'Confirmed' } },
            { $group: { _id: null, total: { $sum: '$billAmount' } } }
        ]);
        const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

        const activeCustomers = await Order.distinct('customerID', dateFilter);
        const societiesData = await Customer.find({ _id: { $in: activeCustomers } }).populate('addresses.society');
        const activeSocieties = new Set(societiesData.flatMap(c => c.addresses.map(a => a.society?.name)).filter(Boolean));
        const orderStatusBreakdown = await Order.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
        ]);
        const recentOrders = await Order.find(dateFilter)
            .sort({ orderedOn: -1 })
            .limit(5)
            .populate({
                path: 'customerID',
                select: 'customerName',
            });

        res.json({
            totalOrders,
            totalRevenue,
            totalActiveCustomers: activeCustomers.length,
            totalActiveSocieties: activeSocieties.size,
            orderStatusBreakdown,
            recentOrders
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ message: 'Server error fetching dashboard stats.' });
    }
});
// =================================================================
//                        START THE SERVER
// =================================================================
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});