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

const customerSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    address: { type: String },
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

const slotSchema = new mongoose.Schema({
    slotName: { type: String, required: true },
    slotType: { type: String, required: true, enum: ['Pickup', 'Delivery'] },
    maxCapacity: { type: Number, default: 5, min: 1 }
});

// ================= MODIFIED SCHEMA =================
const orderSchema = new mongoose.Schema({
    customerID: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderSource: { type: String, enum: [ 'Call', 'Walk-in'], default: 'Call' },
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
        default: 'New' // Default to 'New'
    },
    paymentStatus: { type: String, enum: ['Pending', 'Confirmed'], default: 'Pending' },
    paymentMethod: { type: String, enum: ['Cash', 'Credit-Card', 'Debit-Card', 'UPI'], default: 'Cash' },
    transactionID: { type: String },
    pickupDate: { type: Date, required: true },
    pickupSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    pickupAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    pickupAgentName: { type: String }, // <-- ADDED
    deliveryDate: { type: Date },
    deliverySlot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot' },
    deliveryAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    deliveryAgentName: { type: String } // <-- ADDED
}, { timestamps: { createdAt: 'orderedOn' } });
// ============= END OF MODIFIED SCHEMA ==============


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
        const societies = ["ASBL Springs", "ASBL Spire", "Asbl landmark", "Asbl Gooff","Others"];
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
        console.log('✅ Default slots seeded with new timings and capacity.');
    } catch (error) {
        console.error("❌ Error seeding slots:", error);
    }
}


// =================================================================
//            ADMIN & SUPERVISOR ROUTES
// =================================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/customers.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'customers.html')));
app.get('/slots.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'slots.html')));


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
//            DATA MANAGEMENT ROUTES
// =================================================================

app.get('/api/roles', async (req, res) => {
    try { res.json(await Role.find({})); }
    catch (error) { res.status(500).json({ message: 'Server error while fetching roles.' }); }
});

app.get('/api/societies', async (req, res) => {
    try { res.json(await Society.find({})); }
    catch (error) { res.status(500).json({ message: 'Server error while fetching societies.' }); }
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
    try { res.json(await Staff.find({}).populate('role').populate('society')); }
    catch (error) { res.status(500).json({ message: 'Server error fetching staff.' }); }
});
app.post('/api/staff', async (req, res) => {
    try {
        const newStaff = new Staff(req.body);
        await newStaff.save();
        const populatedStaff = await Staff.findById(newStaff._id).populate('role').populate('society');
        res.status(201).json(populatedStaff);
    } catch (error) { res.status(500).json({ message: 'Error adding staff member.' }); }
});
app.put('/api/staff/:id', async (req, res) => {
    try {
        const updatedStaff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('role').populate('society');
        if (!updatedStaff) return res.status(404).json({ message: 'Staff not found.' });
        res.json(updatedStaff);
    } catch (error) { res.status(500).json({ message: 'Error updating staff.' }); }
});
app.delete('/api/staff/:id', async (req, res) => {
    try {
        const deletedStaff = await Staff.findByIdAndDelete(req.params.id);
        if (!deletedStaff) return res.status(404).json({ message: 'Staff not found.' });
        res.json({ message: 'Staff deleted successfully.' });
    } catch (error) { res.status(500).json({ message: 'Error deleting staff.' }); }
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
    try { res.json(await Customer.find({}).populate('society')); }
    catch (error) { res.status(500).json({ message: 'Server error fetching customers.' }); }
});
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
app.put('/api/customers/:id', async (req, res) => {
    try {
        const updatedCustomer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
            .populate('society');
        if (!updatedCustomer) return res.status(404).json({ message: 'Customer not found.' });
        res.json(updatedCustomer);
    } catch (error) { res.status(500).json({ message: 'Error updating customer.' }); }
});
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
app.get('/api/services', async (req, res) => {
    try {
        res.json(await Service.find({}));
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching services.' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find({})
            .populate({
                path: 'customerID',
                select: 'customerName phone society address', // Added phone and address
                populate: { path: 'society', model: 'Society', select: 'name' }
            })
            .populate('items.serviceID', 'serviceName')
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
                populate: { path: 'society', model: 'Society' }
            })
            .populate('items.serviceID')
            .populate('pickupSlot deliverySlot')
            .populate('pickupAgent deliveryAgent');

        if (!order) return res.status(404).json({ message: 'Order not found.' });
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching order details.' });
    }
});

// ================= MODIFIED ROUTE =================
app.post('/api/orders', async (req, res) => {
    try {
        const { items, pickupDate, pickupSlot, pickupAgent } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'Order must contain at least one item.' });
        }

        // Check slot availability
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
            return res.status(400).json({ message: `Pickup slot for this date is full (limit: ${slot.maxCapacity}). Please choose another.` });
        }

        const newOrderData = { ...req.body };
        
        // Handle pickup agent assignment and status
        if (pickupAgent) {
            const agent = await Staff.findById(pickupAgent);
            if (agent) {
                newOrderData.pickupAgentName = agent.name;
                newOrderData.orderStatus = 'Pick-up Pending'; // Set status if agent is assigned
            }
        } else {
            newOrderData.orderStatus = 'New'; // Set status to 'New' if no agent
        }

        const newOrder = new Order(newOrderData);
        await newOrder.save();
        
        // Populate the new order to send back a complete object
        const populatedOrder = await Order.findById(newOrder._id)
            .populate({
                path: 'customerID',
                select: 'customerName society',
                populate: { path: 'society', model: 'Society', select: 'name' }
            })
            .populate('items.serviceID', 'serviceName')
            .populate('pickupSlot deliverySlot', 'slotName');

        res.status(201).json(populatedOrder);
    } catch (error) {
        console.error(error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
        res.status(500).json({ message: 'Error creating new order.' });
    }
});

// ================= MODIFIED ROUTE =================
app.put('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const updateData = { ...req.body };

        // Check and validate pickup slot change
        if (updateData.pickupDate && updateData.pickupSlot) {
            // ... (slot validation logic remains the same)
        }
        
        // Check and validate delivery slot change
        if (updateData.deliveryDate && updateData.deliverySlot) {
            // ... (slot validation logic remains the same)
        }
        
        // === NEW LOGIC: Save agent name on assignment ===
        if (updateData.pickupAgent) {
            const agent = await Staff.findById(updateData.pickupAgent);
            if(agent) updateData.pickupAgentName = agent.name;
        }

        if (updateData.deliveryAgent) {
            const agent = await Staff.findById(updateData.deliveryAgent);
            if(agent) updateData.deliveryAgentName = agent.name;
        }
        // === END OF NEW LOGIC ===

        const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, { new: true, runValidators: true });
        if (!updatedOrder) return res.status(404).json({ message: 'Order not found.' });

        const populatedOrder = await Order.findById(updatedOrder._id)
             .populate({
                path: 'customerID',
                select: 'customerName phone society address',
                populate: { path: 'society', model: 'Society', select: 'name' }
            })
            .populate('items.serviceID', 'serviceName')
            .populate('pickupSlot deliverySlot', 'slotName');

        res.json(populatedOrder);
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ message: 'Error updating order.' });
    }
});

// =================================================================
//                 DASHBOARD API ROUTE (Replace the old one)
// =================================================================
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = req.query;

        // --- Robust Date Parsing ---
        // This new logic avoids timezone issues by treating date strings as UTC.

        let endDate, startDate;

        // Parse end date string or default to the end of today (in UTC)
        if (endStr) {
            const [year, month, day] = endStr.split('-').map(Number);
            endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        } else {
            endDate = new Date();
            endDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999));
        }

        // Parse start date string or default based on the end date
        if (startStr) {
            const [year, month, day] = startStr.split('-').map(Number);
            startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        } else {
            // Default to 7 days before the end date if start is not provided
            startDate = new Date(endDate);
            startDate.setUTCDate(startDate.getUTCDate() - 6);
            startDate.setUTCHours(0, 0, 0, 0);
        }

        const dateFilter = { orderedOn: { $gte: startDate, $lte: endDate } };

        // --- All other calculations remain the same ---
        const totalOrders = await Order.countDocuments(dateFilter);

        const revenueData = await Order.aggregate([
            { $match: { ...dateFilter, paymentStatus: 'Confirmed' } },
            { $group: { _id: null, total: { $sum: '$billAmount' } } }
        ]);
        const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

        const activeCustomers = await Order.distinct('customerID', dateFilter);
        
        const societiesData = await Customer.find({ _id: { $in: activeCustomers } }).populate('society');
        const activeSocieties = new Set(societiesData.map(c => c.society?.name).filter(Boolean));
        
        const orderStatusBreakdown = await Order.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
        ]);

        const recentOrders = await Order.find(dateFilter)
            .sort({ orderedOn: -1 })
            .limit(5)
            .populate({
                path: 'customerID',
                select: 'customerName society',
                populate: { path: 'society', select: 'name' }
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
app.listen(PORT, () => console.log(`🚀 Server is running on http://localhost:${PORT}`));