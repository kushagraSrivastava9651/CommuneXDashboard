// This script runs after the HTML document has been fully loaded.
document.addEventListener('DOMContentLoaded', () => {
    // Get references to the HTML elements we need to work with.
    const staffGrid = document.getElementById('staffGrid');
    const addStaffForm = document.getElementById('addStaffForm');
    const editStaffForm = document.getElementById('editStaffForm');
    const editModal = document.getElementById('editModal');
    const addModal = document.getElementById('addModal');
    const loadingState = document.getElementById('loadingState');
    
    // An array to hold the fetched staff list to easily find a user to edit
    let currentStaffList = [];
    let availableRoles = [];

    // =================================================================
    // UTILITY FUNCTIONS
    // =================================================================
    
    // Generates initials from a full name.
    function getInitials(name) {
        if (!name) return '??';
        const parts = name.split(' ');
        if (parts.length > 1) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    // Generates a display-friendly Staff ID.
    function generateStaffId(index) {
        return `ST-${String(index + 1).padStart(3, '0')}`;
    }
    
    // =================================================================
    // DATA FETCHING AND RENDERING
    // =================================================================

    // Fetch available roles from the API and populate dropdowns.
    const populateRolesDropdowns = async () => {
        try {
            const response = await fetch('/api/roles');
            availableRoles = await response.json();
            
            const addRoleSelect = document.getElementById('add-role');
            const editRoleSelect = document.getElementById('edit-role');
            
            if (addRoleSelect) {
                addRoleSelect.innerHTML = '<option value="" disabled selected>Select a role</option>'; // Placeholder
                availableRoles.forEach(role => {
                    addRoleSelect.innerHTML += `<option value="${role._id}">${role.role_name}</option>`;
                });
            }
            
            if (editRoleSelect) {
                editRoleSelect.innerHTML = ''; // Clear existing options
                availableRoles.forEach(role => {
                    editRoleSelect.innerHTML += `<option value="${role._id}">${role.role_name}</option>`;
                });
            }
        } catch (error) {
            console.error('Failed to fetch roles:', error);
        }
    };

    // Renders the staff data into cards in the UI.
    function renderStaffCards(data = currentStaffList) {
        if (!staffGrid) return;
        
        if (data.length === 0) {
            staffGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <h3>No staff members found</h3>
                    <p>Get started by adding your first staff member.</p>
                </div>`;
            return;
        }

        staffGrid.innerHTML = data.map((staff, index) => `
            <div class="staff-card">
                <div class="staff-header">
                    <div class="staff-info">
                        <div class="staff-avatar">${getInitials(staff.name)}</div>
                        <div class="staff-details">
                            <h3>${staff.name}</h3>
                            <div class="staff-id">${generateStaffId(index)}</div>
                        </div>
                    </div>
                    <div class="staff-actions">
                        <button class="action-btn edit-btn" onclick="openEditModal('${staff._id}')" title="Edit">✏️</button>
                        <button class="action-btn delete-btn" onclick="deleteStaff('${staff._id}')" title="Delete">🗑️</button>
                    </div>
                </div>
                
                <div class="role-badge">${staff.role ? staff.role.role_name : 'No Role'}</div>
                
                <div class="contact-info">
                    <div class="contact-item">
                        <span class="contact-icon">📞</span>
                        ${staff.phone || 'No phone'}
                    </div>
                    <div class="contact-item">
                        <span class="contact-icon">📍</span>
                        ${staff.society || 'No society'}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Fetches all staff from the API and triggers rendering.
    const fetchStaff = async () => {
        try {
            if (loadingState) loadingState.style.display = 'flex';
            if (staffGrid) staffGrid.style.display = 'none';

            const response = await fetch('/api/staff');
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            
            currentStaffList = await response.json();
            renderStaffCards();

            if (loadingState) loadingState.style.display = 'none';
            if (staffGrid) staffGrid.style.display = 'grid';

        } catch (error) {
            console.error('Failed to fetch staff:', error);
            if (loadingState) {
                loadingState.innerHTML = `<div style="text-align: center; color: #ef4444;">...Error...</div>`;
            }
            alert('Could not load staff data.');
        }
    };

    // =================================================================
    // MODAL AND FORM HANDLING
    // =================================================================
    
    window.openAddModal = () => addModal && (addModal.style.display = 'block');
    window.closeAddModal = () => {
        if (addModal) addModal.style.display = 'none';
        if (addStaffForm) addStaffForm.reset();
    };

    window.openEditModal = (id) => {
        const staffToEdit = currentStaffList.find(staff => staff._id === id);
        if (staffToEdit && editModal) {
            // Populate the edit form with the correct staff data
            document.getElementById('edit-staff-id').value = staffToEdit._id;
            document.getElementById('edit-name').value = staffToEdit.name;
            document.getElementById('edit-phone').value = staffToEdit.phone || '';
            document.getElementById('edit-society').value = staffToEdit.society || '';
            // Set the dropdown to the correct role using its ID
            document.getElementById('edit-role').value = staffToEdit.role ? staffToEdit.role._id : '';
            
            editModal.style.display = 'block';
        }
    };
    window.closeEditModal = () => {
        if (editModal) editModal.style.display = 'none';
        if (editStaffForm) editStaffForm.reset();
    };

    // Handle form submission for adding a new staff member.
    if (addStaffForm) {
        addStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(addStaffForm);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/staff', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    closeAddModal();
                    fetchStaff(); // Refresh the list
                } else {
                    const error = await response.json();
                    alert(`Error: ${error.message}`);
                }
            } catch (error) {
                console.error('Failed to add staff:', error);
                alert('An error occurred while adding the staff member.');
            }
        });
    }

    // Handle form submission for updating an existing staff member.
    if (editStaffForm) {
        editStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(editStaffForm);
            const data = Object.fromEntries(formData.entries());
            const staffId = data.id; // Get ID from the hidden form field

            // We don't want to send the id in the request body
            delete data.id; 

            try {
                const response = await fetch(`/api/staff/${staffId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data) // Send updated data
                });

                if (response.ok) {
                    closeEditModal();
                    fetchStaff(); // Refresh the list
                } else {
                    const error = await response.json();
                    alert(`Error updating staff: ${error.message}`);
                }
            } catch (error) {
                console.error('Failed to update staff:', error);
                alert('An error occurred while updating the staff member.');
            }
        });
    }

    // =================================================================
    // DELETE AND SEARCH
    // =================================================================
    
    window.deleteStaff = async (id) => {
        if (confirm('Are you sure you want to delete this staff member?')) {
            try {
                const response = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    fetchStaff(); // Refresh list after deletion
                } else {
                    const error = await response.json();
                    alert(`Error: ${error.message}`);
                }
            } catch (error) {
                console.error('Failed to delete staff:', error);
                alert('An error occurred while deleting the staff member.');
            }
        }
    };
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredData = currentStaffList.filter(staff => 
                staff.name.toLowerCase().includes(searchTerm) ||
                (staff.phone && staff.phone.includes(searchTerm)) ||
                (staff.role && staff.role.role_name.toLowerCase().includes(searchTerm)) ||
                (staff.society && staff.society.toLowerCase().includes(searchTerm))
            );
            renderStaffCards(filteredData);
        });
    }

    // Close modals if user clicks outside of them
    window.addEventListener('click', (e) => {
        if (e.target === addModal) closeAddModal();
        if (e.target === editModal) closeEditModal();
    });

    // =================================================================
    // INITIALIZATION
    // =================================================================
    
    // Initial fetch and setup when the page loads
    async function initialize() {
        await populateRolesDropdowns(); // Load roles first
        await fetchStaff(); // Then load staff
    }

    initialize();
});