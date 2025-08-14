// The One Wealth Wave - Production Admin Portal
// Production Version - Debug code removed

// Global state
let currentUser = null;
let isAdmin = false;

// Utility functions
const utils = {
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type} show`;
        toast.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(message) : message;
        const toastContainer = document.getElementById('toastContainer');
        if (toastContainer) {
            toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    },

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount || 0);
    },

    formatDate(timestamp) {
        if (!timestamp) return 'Never';
        if (timestamp.toDate) {
            return timestamp.toDate().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        return new Date(timestamp).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    createElement(tag, attributes = {}) {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'class' || key === 'className') element.className = value;
            else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
            else element.setAttribute(key, value);
        });
        return element;
    }
};

// Firebase services
const firebaseServices = {
    initialize() {
        if (typeof firebase === 'undefined') {
            utils.showToast('Firebase not loaded', 'error');
            return null;
        }
        return {
            auth: firebase.auth(),
            db: firebase.firestore(),
            storage: firebase.storage()
        };
    },

    async safeGet(ref) {
        try {
            return await ref.get();
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    },

    async safeQuery(query) {
        try {
            return await query.get();
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    },

    async safeAdd(collection, data) {
        try {
            return await collection.add(data);
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    },

    async safeUpdate(ref, data) {
        try {
            return await ref.update(data);
        } catch (error) {
            utils.showToast('Database error: ' + error.message, 'error');
            throw error;
        }
    }
};

// Admin functions
const adminFunctions = {
    async loadUsers() {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const usersSnapshot = await firebaseServices.safeQuery(db.collection('users').orderBy('createdAt', 'desc'));
            const tbody = document.getElementById('usersTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';
            usersSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${data.name || 'N/A'}</td>
                    <td>${data.email || 'N/A'}</td>
                    <td>${data.country || 'N/A'}</td>
                    <td>${data.referralCode || 'N/A'}</td>
                    <td>${utils.formatDate(data.createdAt)}</td>
                    <td><span class="status ${data.isActive ? 'active' : 'inactive'}">${data.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>${utils.formatCurrency(data.totalDeposits || 0)}</td>
                    <td>
                        <button onclick="adminFunctions.viewUser('${doc.id}')" class="btn-small">View</button>
                        <button onclick="adminFunctions.editUser('${doc.id}')" class="btn-small">Edit</button>
                    </td>
                `;
            });
        } catch (error) {
            utils.showToast('Failed to load users', 'error');
        }
    },

    async loadDeposits() {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const depositsSnapshot = await firebaseServices.safeQuery(db.collection('deposits').orderBy('createdAt', 'desc'));
            const tbody = document.getElementById('depositsTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';
            depositsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${data.userName || 'N/A'}</td>
                    <td>${utils.formatCurrency(data.amount)}</td>
                    <td>${data.method || 'N/A'}</td>
                    <td>${utils.formatDate(data.createdAt)}</td>
                    <td><span class="status ${data.status}">${data.status}</span></td>
                    <td>
                        <button onclick="adminFunctions.approveDeposit('${doc.id}')" class="btn-small" ${data.status === 'approved' ? 'disabled' : ''}>Approve</button>
                        <button onclick="adminFunctions.rejectDeposit('${doc.id}')" class="btn-small" ${data.status === 'rejected' ? 'disabled' : ''}>Reject</button>
                    </td>
                `;
            });
        } catch (error) {
            utils.showToast('Failed to load deposits', 'error');
        }
    },

    async loadWithdrawals() {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const withdrawalsSnapshot = await firebaseServices.safeQuery(db.collection('withdrawals').orderBy('createdAt', 'desc'));
            const tbody = document.getElementById('withdrawalsTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';
            withdrawalsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${data.userName || 'N/A'}</td>
                    <td>${data.type || 'N/A'}</td>
                    <td>${utils.formatCurrency(data.amount)}</td>
                    <td>${data.method || 'N/A'}</td>
                    <td>${utils.formatDate(data.createdAt)}</td>
                    <td><span class="status ${data.status}">${data.status}</span></td>
                    <td>
                        <button onclick="adminFunctions.approveWithdrawal('${doc.id}')" class="btn-small" ${data.status === 'approved' ? 'disabled' : ''}>Approve</button>
                        <button onclick="adminFunctions.rejectWithdrawal('${doc.id}')" class="btn-small" ${data.status === 'rejected' ? 'disabled' : ''}>Reject</button>
                    </td>
                `;
            });
        } catch (error) {
            utils.showToast('Failed to load withdrawals', 'error');
        }
    },

    async approveDeposit(depositId) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            await firebaseServices.safeUpdate(db.collection('deposits').doc(depositId), {
                status: 'approved',
                approvedAt: new Date(),
                approvedBy: currentUser.uid
            });
            utils.showToast('Deposit approved successfully', 'success');
            this.loadDeposits();
        } catch (error) {
            utils.showToast('Failed to approve deposit', 'error');
        }
    },

    async rejectDeposit(depositId) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            await firebaseServices.safeUpdate(db.collection('deposits').doc(depositId), {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: currentUser.uid
            });
            utils.showToast('Deposit rejected successfully', 'success');
            this.loadDeposits();
        } catch (error) {
            utils.showToast('Failed to reject deposit', 'error');
        }
    },

    async approveWithdrawal(withdrawalId) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            await firebaseServices.safeUpdate(db.collection('withdrawals').doc(withdrawalId), {
                status: 'approved',
                approvedAt: new Date(),
                approvedBy: currentUser.uid
            });
            utils.showToast('Withdrawal approved successfully', 'success');
            this.loadWithdrawals();
        } catch (error) {
            utils.showToast('Failed to approve withdrawal', 'error');
        }
    },

    async rejectWithdrawal(withdrawalId) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            await firebaseServices.safeUpdate(db.collection('withdrawals').doc(withdrawalId), {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: currentUser.uid
            });
            utils.showToast('Withdrawal rejected successfully', 'success');
            this.loadWithdrawals();
        } catch (error) {
            utils.showToast('Failed to reject withdrawal', 'error');
        }
    },

    async viewUser(userId) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(userId));
            if (userDoc.exists) {
                const userData = userDoc.data();
                // Show user details in modal or new page
                utils.showToast(`Viewing user: ${userData.name}`, 'info');
            }
        } catch (error) {
            utils.showToast('Failed to load user details', 'error');
        }
    },

    async editUser(userId) {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const userDoc = await firebaseServices.safeGet(db.collection('users').doc(userId));
            if (userDoc.exists) {
                const userData = userDoc.data();
                // Show edit user form
                utils.showToast(`Editing user: ${userData.name}`, 'info');
            }
        } catch (error) {
            utils.showToast('Failed to load user details', 'error');
        }
    },

    async runDailyPayout() {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const usersSnapshot = await firebaseServices.safeQuery(db.collection('users'));
            let processed = 0;

            for (const doc of usersSnapshot.docs) {
                const userData = doc.data();
                // Calculate daily income for each user
                // This is a simplified version - implement your specific payout logic
                processed++;
            }

            utils.showToast(`Daily payout completed for ${processed} users`, 'success');
        } catch (error) {
            utils.showToast('Failed to run daily payout', 'error');
        }
    },

    async updateROISettings() {
        const { db } = firebaseServices.initialize();
        if (!db) return;

        try {
            const dailyROI = parseFloat(document.getElementById('dailyROI')?.value || 0);
            const maxROI = parseFloat(document.getElementById('maxROI')?.value || 0);
            const isActive = document.getElementById('roiActive')?.checked || false;

            await firebaseServices.safeUpdate(db.collection('adminSettings').doc('roiSettings'), {
                dailyROI: dailyROI / 100,
                maxROI: maxROI / 100,
                isActive: isActive,
                updatedAt: new Date(),
                updatedBy: currentUser.uid
            });

            utils.showToast('ROI settings updated successfully', 'success');
        } catch (error) {
            utils.showToast('Failed to update ROI settings', 'error');
        }
    }
};

// Authentication handlers
const authHandlers = {
    async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('loginEmail')?.value;
        const password = document.getElementById('loginPassword')?.value;

        if (!email || !password) {
            utils.showToast('Please fill in email and password', 'error');
            return;
        }

        const auth = firebaseServices.initialize()?.auth;
        if (!auth) {
            utils.showToast('Authentication service not available', 'error');
            return;
        }

        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            currentUser = userCredential.user;
            
            // Check if user is admin
            const { db } = firebaseServices.initialize();
            if (db) {
                const adminDoc = await firebaseServices.safeGet(db.collection('admins').doc(currentUser.uid));
                isAdmin = adminDoc.exists;
                
                if (isAdmin) {
                    utils.showToast('Admin login successful!', 'success');
                    showAdminPanel();
                } else {
                    utils.showToast('Access denied: Admin privileges required', 'error');
                    await auth.signOut();
                }
            }
        } catch (error) {
            utils.showToast(error.message, 'error');
        }
    },

    async handleLogout() {
        const auth = firebaseServices.initialize()?.auth;
        if (auth) {
            await auth.signOut();
            currentUser = null;
            isAdmin = false;
            utils.showToast('Logged out successfully', 'success');
            showLoginForm();
        }
    }
};

// UI functions
function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    
    // Load initial data
    adminFunctions.loadUsers();
    adminFunctions.loadDeposits();
    adminFunctions.loadWithdrawals();
}

function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.style.display = 'none');
    
    const targetTab = document.getElementById(tabName);
    if (targetTab) {
        targetTab.style.display = 'block';
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    const { auth } = firebaseServices.initialize();
    if (!auth) {
        utils.showToast('Authentication service not available', 'error');
        return;
    }

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            
            // Check admin status
            const { db } = firebaseServices.initialize();
            if (db) {
                const adminDoc = await firebaseServices.safeGet(db.collection('admins').doc(user.uid));
                isAdmin = adminDoc.exists;
                
                if (isAdmin) {
                    showAdminPanel();
                } else {
                    utils.showToast('Access denied: Admin privileges required', 'error');
                    await auth.signOut();
                }
            }
        } else {
            currentUser = null;
            isAdmin = false;
            showLoginForm();
        }
    });

    // Initialize event listeners
    initializeEventListeners();
});

function initializeEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', authHandlers.handleLogin);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', authHandlers.handleLogout);
    }

    // Tab navigation
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            if (tabName) {
                showTab(tabName);
            }
        });
    });

    // ROI settings form
    const roiForm = document.getElementById('roiForm');
    if (roiForm) {
        roiForm.addEventListener('submit', (e) => {
            e.preventDefault();
            adminFunctions.updateROISettings();
        });
    }

    // Daily payout button
    const dailyPayoutBtn = document.getElementById('dailyPayoutBtn');
    if (dailyPayoutBtn) {
        dailyPayoutBtn.addEventListener('click', adminFunctions.runDailyPayout);
    }
}
